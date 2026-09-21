// M1 unit tests: node coach/tests.js  (exit 1 on any failure)
// Covers: metrics, analyzer, comparison, session store, AttemptRecorder race,
// LLM provider config, LLM JSON validation, LLM fallback behavior.
const { AttemptRecorder } = require('../public/attempt-recorder');
const { computeMetrics } = require('./metrics');
const { analyzeAttempt } = require('./analyze');
const { compareAttempts } = require('./compare');
const { createSession, getSession, addAttempt } = require('./session');
const { pickPrompt, PROMPTS } = require('./prompts');
const { getProviderConfig } = require('./llm/provider');
const { analyzeWithLLM, buildCoachInput, validateFeedback } = require('./llm-analyze');
const { analyzeAttemptForSession } = require('./coach-engine');
const { buildHealth } = require('./health');
const { chunkPCM16 } = require('../public/sample-player');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  cond ? pass++ : fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra || ''));
};

// ---------- AttemptRecorder race tests ----------
{
  // 1. Final already received before Finish → immediate submit
  const r = new AttemptRecorder();
  r.start(1000);
  r.onTurn({ text: 'I play football.', final: false, order: 0 });
  const d0 = r.onTurn({ text: 'I play football.', final: true, order: 0 });
  ok('race1 no early submit', d0 === null);
  const f = r.finish(5000);
  ok('race1 immediate submit', f.status === 'submitted' && f.attempt.transcript === 'I play football.' && f.attempt.durationMs === 4000 && f.attempt.turnCount === 1);
}
{
  // 2. Final arrives after Finish → waits, then submits once
  const r = new AttemptRecorder();
  r.start(1000);
  r.onTurn({ text: 'I play foot', final: false, order: 0 });
  const f = r.finish(3000);
  ok('race2 waiting', f.status === 'waiting' && r.isFinishing());
  const d = r.onTurn({ text: 'I play football.', final: true, order: 0 });
  ok('race2 submits on boundary', !!d && d.transcript === 'I play football.' && d.durationMs === 2000);
  ok('race2 state submitted', r.state === 'submitted');
}
{
  // 3. Multiple Turns after Finish → partials + final all included up to boundary
  const r = new AttemptRecorder();
  r.start(0);
  r.onTurn({ text: 'I play', final: false, order: 0 });
  ok('race3 finish waits', r.finish(1000).status === 'waiting');
  ok('race3 partial ignored', r.onTurn({ text: 'I play foot', final: false, order: 0 }) === null);
  ok('race3 partial2 ignored', r.onTurn({ text: 'I play football', final: false, order: 0 }) === null);
  const d = r.onTurn({ text: 'I play football every Sunday.', final: true, order: 0 });
  ok('race3 final submits all', !!d && d.transcript === 'I play football every Sunday.' && d.turnCount === 1);
}
{
  // 4. Speech before Start is excluded (incl. stale final arriving after Start)
  const r = new AttemptRecorder();
  r.onTurn({ text: 'Old speech.', final: false, order: 0 });
  r.onTurn({ text: 'Old speech.', final: true, order: 0 });
  r.start(5000);
  const stale = r.onTurn({ text: 'Old speech.', final: true, order: 0 });
  ok('race4 stale final excluded', stale === null);
  r.onTurn({ text: 'New words here.', final: true, order: 1 });
  const f = r.finish(9000);
  ok('race4 only new text', f.status === 'submitted' && f.attempt.transcript === 'New words here.');
}
{
  // 5. Speech after finalize is excluded
  const r = new AttemptRecorder();
  r.start(0);
  r.onTurn({ text: 'First attempt.', final: true, order: 0 });
  const f = r.finish(1000);
  ok('race5 submitted', f.status === 'submitted');
  ok('race5 later final excluded', r.onTurn({ text: 'Later speech.', final: true, order: 1 }) === null);
  ok('race5 later partial excluded', r.onTurn({ text: 'Later', final: false, order: 1 }) === null);
}
{
  // 6. Double finish cannot resubmit
  const r = new AttemptRecorder();
  r.start(0);
  r.onTurn({ text: 'Trying.', final: false, order: 0 });
  ok('race6 first finish waits', r.finish(1000).status === 'waiting');
  ok('race6 second finish duplicate', r.finish(1200).status === 'duplicate');
  const d = r.onTurn({ text: 'Trying again.', final: true, order: 0 });
  ok('race6 single submit', !!d && d.transcript === 'Trying again.');
  ok('race6 finish after submit duplicate', r.finish(2000).status === 'duplicate');
  ok('race6 empty finish', new AttemptRecorder().finish(0).status === 'invalid');
  const r2 = new AttemptRecorder();
  r2.start(0);
  ok('race6 silent finish empty', r2.finish(500).status === 'empty');
  const r3 = new AttemptRecorder();
  ok('idle fresh', r3.isIdle() && !r3.isRecording() && !r3.isFinishing(), '');
  r3.start(0);
  ok('idle false when recording', !r3.isIdle() && r3.isRecording(), '');
}

// ---------- metrics ----------
{
  const weak = computeMetrics({ transcript: 'Um, so like, I I think uh you know the the movie was was really really good basically.', durationMs: 12000, turnCount: 3 });
  ok('m words=18', weak.wordCount === 18, ' got ' + weak.wordCount);
  ok('m wpm=90', weak.wpm === 90, ' got ' + weak.wpm);
  ok('m fillers=5', weak.fillerCount === 5, ' got ' + weak.fillerCount);
  ok('m rate=27.8', weak.fillerRatePer100 === 27.8, ' got ' + weak.fillerRatePer100);
  ok('m repeats=4', weak.repeatCount === 4, ' got ' + weak.repeatCount);
  const strong = computeMetrics({ transcript: 'My name is Alex and I work as a nurse. I chose this job because I like helping people through difficult days. Last week a patient thanked me, and that reminded me why the work matters.', durationMs: 30000, turnCount: 2 });
  ok('m strong wpm=72', strong.wpm === 72, ' got ' + strong.wpm);
  ok('m strong fillers=1', strong.fillerCount === 1, ' got ' + strong.fillerCount);
  ok('m strong repeats=0', strong.repeatCount === 0);
  ok('m strong sentences=3', strong.sentenceCount === 3, ' got ' + strong.sentenceCount);
}

// ---------- analyzer ----------
{
  const weak = computeMetrics({ transcript: 'Um, so like, I I think uh you know the the movie was was really really good basically.', durationMs: 12000, turnCount: 3 });
  const wa = analyzeAttempt({ metrics: weak });
  ok('a shape', !!(wa.strengths && wa.areas_to_improve && wa.actionable_feedback && wa.retry_focus && wa.retry_focus.targets), '');
  ok('a weak areas', wa.areas_to_improve.length > 0);
  ok('a weak focus fillers', wa.retry_focus.targets.includes('fillerRatePer100'), '');
  ok('a no generic praise', !JSON.stringify(wa).match(/Good job|confidently/i), '');
  const strong = computeMetrics({ transcript: 'My name is Alex and I work as a nurse. I like helping people.', durationMs: 20000, turnCount: 1 });
  ok('a strong strengths', analyzeAttempt({ metrics: strong }).strengths.length > 0, '');
}

// ---------- comparison ----------
{
  const weak = computeMetrics({ transcript: 'Um, so like, I I think uh you know the the movie was was really really good basically.', durationMs: 12000, turnCount: 3 });
  const wa = analyzeAttempt({ metrics: weak });
  const better = computeMetrics({ transcript: 'My name is Alex and I work as a nurse. I chose this job because I like helping people through difficult days.', durationMs: 30000, turnCount: 2 });
  const ia = analyzeAttempt({ metrics: better });
  const cmp = compareAttempts(wa, ia, wa.retry_focus);
  ok('c shape', !!(cmp.improved && cmp.same && cmp.worse && cmp.next_focus), '');
  ok('c addressed', cmp.retry_focus_addressed === true, ' got ' + cmp.retry_focus_addressed);
  ok('c fillers improved', cmp.improved.some((i) => i.metric === 'fillerRatePer100'), '');
  const worseM = computeMetrics({ transcript: 'Um uh like basically you know um uh like it was was good um.', durationMs: 10000, turnCount: 2 });
  const cmpW = compareAttempts(ia, analyzeAttempt({ metrics: worseM }), ia.retry_focus);
  ok('c regression', cmpW.worse.length > 0, ' worse=' + cmpW.worse.length);
  ok('c regression focus false', cmpW.retry_focus_addressed === false, '');
}

// ---------- session ----------
{
  const s = createSession(pickPrompt());
  ok('s prompts', PROMPTS.length > 0);
  ok('s created', !!s.id && !!s.prompt.title);
  const a1 = addAttempt(s.id, { transcript: 'x', durationMs: 1, turnCount: 1, metrics: {}, analysis: {} });
  const a2 = addAttempt(s.id, { transcript: 'y', durationMs: 1, turnCount: 1, metrics: {}, analysis: {} });
  ok('s numbering', a1.n === 1 && a2.n === 2);
  ok('s count', getSession(s.id).attempts.length === 2);
  ok('s unknown', getSession('nope') === null && addAttempt('nope', {}) === null);
}

console.log('RESULT pass=' + pass + ' fail=' + fail);
if (fail) process.exit(1);

// ---------- LLM provider config + validation + fallback (async) ----------
(async () => {
  const cfgNone = getProviderConfig({});
  ok('llm no keys -> null', cfgNone === null);
  const cfgOR = getProviderConfig({ COACH_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' });
  ok('llm openrouter defaults', cfgOR && cfgOR.name === 'openrouter' && cfgOR.model === 'openrouter/free' && cfgOR.baseURL.includes('openrouter'), '');
  const cfgGroq = getProviderConfig({ COACH_PROVIDER: 'groq', GROQ_API_KEY: 'k', COACH_MODEL: 'llama-x' });
  ok('llm groq override', cfgGroq && cfgGroq.name === 'groq' && cfgGroq.model === 'llama-x' && cfgGroq.baseURL.includes('groq') && cfgGroq.apiKey === 'k', '');
  const cfgGroqDef = getProviderConfig({ COACH_PROVIDER: 'groq', GROQ_API_KEY: 'k' });
  ok('llm groq default model', cfgGroqDef && cfgGroqDef.model === 'openai/gpt-oss-20b', ' got ' + (cfgGroqDef && cfgGroqDef.model));

  // input builder
  const metrics = computeMetrics({ transcript: 'I play football every Sunday with friends.', durationMs: 8000, turnCount: 1 });
  const prompt = { title: 'T', objective: 'O' };
  const first = buildCoachInput({ prompt, transcript: 'hi', metrics, previous: null });
  ok('llm input first', first.previousAttempt === null && first.retryNote === null && first.attempt.metrics.wordCount === 7, '');
  const retry = buildCoachInput({ prompt, transcript: 'hi', metrics, previous: { transcript: 'old', metrics, analysis: { strengths: ['s'], areas_to_improve: ['a'], retry_focus: { focus: 'f', targets: ['wpm'], tip: 't' } } } });
  ok('llm input retry', !!retry.previousAttempt && typeof retry.retryNote === 'string' && retry.retryNote.includes('retry'), '');

  // validation
  const good = { strengths: ['Steady pace at 120 wpm.'], areas_to_improve: ['Two filler words.'], actionable_feedback: ['Pause instead of saying um.'], retry_focus: { focus: 'Cut fillers.', targets: ['fillerRatePer100'], tip: 'Pause silently.' }, observations: [] };
  const v = validateFeedback(good);
  ok('llm valid passes', v.retry_focus.focus === 'Cut fillers.' && v.strengths.length === 1, '');
  for (const [name, bad] of [
    ['missing keys', { strengths: [] }],
    ['empty strengths', { ...good, strengths: [] }],
    ['non-string item', { ...good, strengths: [42] }],
    ['bad retry_focus', { ...good, retry_focus: 'just try harder' }],
    ['not object', [1, 2]],
  ]) {
    let threw = false;
    try { validateFeedback(bad); } catch (e) { threw = true; }
    ok('llm invalid: ' + name, threw);
  }

  // no provider configured -> throws (caller falls back)
  let threwNone = false;
  try {
    await analyzeWithLLM({ prompt, transcript: 'hi', metrics, previous: null }, { env: {} });
  } catch (e) { threwNone = /No LLM provider/.test(e.message); }
  ok('llm unconfigured throws', threwNone);

  // mocked success (OpenRouter-shaped)
  const mockOK = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(good) } }] }),
  });
  const out = await analyzeWithLLM(
    { prompt, transcript: 'hi', metrics, previous: null },
    { env: { COACH_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k' }, fetchImpl: mockOK, timeoutMs: 2000 }
  );
  ok('llm mocked success', out.strengths.length === 1 && out.metrics === metrics && out.provider === 'openrouter', '');

  // malformed JSON -> throws
  const mockBadJSON = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json {{' } }] }) });
  let threwJSON = false;
  try {
    await analyzeWithLLM({ prompt, transcript: 'hi', metrics, previous: null }, { env: { COACH_PROVIDER: 'groq', GROQ_API_KEY: 'k' }, fetchImpl: mockBadJSON, timeoutMs: 2000 });
  } catch (e) { threwJSON = true; }
  ok('llm malformed JSON throws', threwJSON);

  // HTTP 500 -> throws
  const mock500 = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  let threw500 = false;
  try {
    await analyzeWithLLM({ prompt, transcript: 'hi', metrics, previous: null }, { env: { COACH_PROVIDER: 'groq', GROQ_API_KEY: 'k' }, fetchImpl: mock500, timeoutMs: 2000 });
  } catch (e) { threw500 = /HTTP 500/.test(e.message); }
  ok('llm http500 throws', threw500);

  // network failure -> throws
  let threwNet = false;
  try {
    await analyzeWithLLM({ prompt, transcript: 'hi', metrics, previous: null }, { env: { COACH_PROVIDER: 'groq', GROQ_API_KEY: 'k' }, fetchImpl: async () => { throw new Error('socket hangup'); }, timeoutMs: 2000 });
  } catch (e) { threwNet = /socket hangup/.test(e.message); }
  ok('llm network throws', threwNet);

  console.log('LLM-RESULT pass=' + pass + ' fail=' + fail);
  if (fail) process.exit(1);

  // ---------- coach-engine routing ----------
  const fakeMetrics = { wordCount: 10 };
  const fakeRules = { strengths: ['r'], areas_to_improve: [], actionable_feedback: [], retry_focus: { focus: 'f', targets: [], tip: '' } };
  const fakeLLM = { strengths: ['l'], areas_to_improve: [], actionable_feedback: [], retry_focus: { focus: 'f', targets: [], tip: '' } };
  let llmCalls = 0;
  let llmGot = null;
  const spyLLM = async (args) => { llmCalls++; llmGot = args; return fakeLLM; };
  const spyRules = () => fakeRules;

  const rRules = await analyzeAttemptForSession({ engine: 'rules', prompt: {}, transcript: 't', metrics: fakeMetrics, previous: null, llmAnalyze: spyLLM, rulesAnalyze: spyRules });
  ok('engine rules skips LLM', llmCalls === 0 && rRules.coachSource === 'rules' && rRules.requested === 'rules' && rRules.fallback === false, '');

  const rAI = await analyzeAttemptForSession({ engine: 'ai', prompt: { title: 'T' }, transcript: 'hello world', metrics: fakeMetrics, previous: { transcript: 'old' }, llmAnalyze: spyLLM, rulesAnalyze: spyRules });
  ok('engine ai invokes LLM', llmCalls === 1 && rAI.coachSource === 'llm' && rAI.requested === 'ai', '');
  ok('engine ai passes context', llmGot && llmGot.transcript === 'hello world' && llmGot.previous && llmGot.previous.transcript === 'old' && llmGot.metrics === fakeMetrics, '');

  const rDefault = await analyzeAttemptForSession({ prompt: {}, transcript: 't', metrics: fakeMetrics, previous: null, llmAnalyze: spyLLM, rulesAnalyze: spyRules });
  ok('engine default is ai', llmCalls === 2 && rDefault.requested === 'ai', '');

  const rFail = await analyzeAttemptForSession({ engine: 'ai', prompt: {}, transcript: 't', metrics: fakeMetrics, previous: null, llmAnalyze: async () => { throw new Error('down'); }, rulesAnalyze: spyRules });
  ok('engine ai failure falls back', rFail.coachSource === 'rules' && rFail.fallback === true && rFail.analysis === fakeRules && rFail.requested === 'ai', '');

  console.log('ENGINE-RESULT pass=' + pass + ' fail=' + fail);

  // ---------- deployment health checks ----------
  const hFull = buildHealth({ ASSEMBLYAI_API_KEY: 'k', COACH_PROVIDER: 'groq', GROQ_API_KEY: 'k', COACH_MODEL: 'm' });
  ok('health full', hFull.ok === true && hFull.speech === 'ready' && hFull.coach === 'ai-groq' && hFull.coachModel === 'm', '');
  const hRules = buildHealth({ ASSEMBLYAI_API_KEY: 'k' });
  ok('health rules', hRules.ok === true && hRules.coach === 'rules' && hRules.coachModel === null, '');
  const hNone = buildHealth({});
  ok('health missing', hNone.ok === false && hNone.speech === 'missing-key' && hNone.coach === 'rules', '');
  ok('health no secrets', !JSON.stringify(buildHealth({ ASSEMBLYAI_API_KEY: 'sekret-key', GROQ_API_KEY: 'sekret-g' })).includes('sekret'), '');

  console.log('HEALTH-RESULT pass=' + pass + ' fail=' + fail);

  // ---------- sample chunking (50–1000 ms rule) ----------
  {
    const exact = chunkPCM16(new Int16Array(4800), 1600);
    ok('chunk exact', exact.chunks.length === 3 && exact.chunks.every((c) => c.length === 1600) && exact.tail === 0, '');
    const withValidTail = chunkPCM16(new Int16Array(4800 + 1000), 1600);
    ok('chunk valid tail sent', withValidTail.chunks.length === 4 && withValidTail.chunks[3].length === 1000 && withValidTail.tail === 0, '');
    const withShortTail = chunkPCM16(new Int16Array(4800 + 799), 1600);
    ok('chunk short tail held', withShortTail.chunks.length === 3 && withShortTail.tail === 799, '');
    const tiny = chunkPCM16(new Int16Array(100), 1600);
    ok('chunk tiny held', tiny.chunks.length === 0 && tiny.tail === 100, '');
    const boundary = chunkPCM16(new Int16Array(1600 + 800), 1600);
    ok('chunk 50ms boundary', boundary.chunks.length === 2 && boundary.tail === 0, '');
  }

  console.log('SAMPLE-RESULT pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL llm harness crashed: ' + e.message); process.exit(1); });
