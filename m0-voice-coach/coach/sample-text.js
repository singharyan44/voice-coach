// On-the-fly practice sample texts (replaces static TTS WAV clips).
//
// Flow: LLM writes fresh sample text per request → browser speaks it aloud
// (speechSynthesis) → the live mic captures it → AssemblyAI transcribes it
// like any real speech. Same Turn pipeline, zero new keys or services.
//
// generateSampleText({ kind, topic, motion, side }, opts) -> { text }
// Throws on any problem (unknown kind, no provider, network, bad shape) and
// the caller falls back to STATIC_SAMPLES. Kinds:
//   speech-weak    — filler-heavy practice answer (~3 sentences)
//   speech-clean   — clean practice answer (~3 sentences)
//   debate-for     — argument FOR the motion (~4 sentences, one vague claim)
//   debate-against — argument AGAINST the motion (~4 sentences)

const { getProviderConfig } = require('./llm/provider');
const openrouter = require('./llm/openrouter');
const groq = require('./llm/groq');

const PROVIDER_MODULES = { openrouter, groq };

const STATIC_SAMPLES = {
  'speech-weak':
    'Um, so like, I think, uh, you know, the movie was, was really, really good, basically. I, I liked it a lot.',
  'speech-clean':
    'My name is Alex and I work as a nurse. I chose this job because I like helping people through difficult days. Last week a patient thanked me, and that reminded me why the work matters.',
  'debate-for':
    'Artificial intelligence is good for education because it personalizes learning for every single student. Studies show students improve a lot when lessons adapt to them. Every school should use it as soon as possible.',
  'debate-against':
    'Artificial intelligence harms education because students stop thinking for themselves. Real learning comes from struggling through hard problems. Depending on machines will only make young minds lazy.',
};

const SYSTEM_PROMPT = `You write short spoken practice samples for a voice-coaching app. The text will be read aloud by text-to-speech and transcribed, so write naturally speakable words only: no stage directions, no markdown, no quotes around the whole thing, no lists.

Rules by kind (given in the request):
- speech-weak: 2-4 sentences on the topic, WITH natural filler words (um, uh, like, you know), one repeated word, conversational and slightly rambling. 30-60 words.
- speech-clean: 3-4 clear sentences on the topic, zero fillers, complete sentences. 35-65 words.
- debate-for: 3-4 sentence argument FOR the motion, spoken style, including exactly one vague evidence claim (e.g. "studies show") for the opponent to attack. 40-70 words.
- debate-against: 3-4 sentence argument AGAINST the motion, spoken style, with one concrete example. 40-70 words.

Respond with JSON ONLY, no markdown fences: { "text": "..." }`;

function buildSampleUser({ kind, topic, motion, side }) {
  const parts = ['kind: ' + kind];
  if (topic) parts.push('topic: ' + String(topic).slice(0, 300));
  if (motion) parts.push('motion: ' + String(motion).slice(0, 300));
  if (side) parts.push('argue_side: ' + side);
  return parts.join('\n');
}

function parseJSON(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

function validateText(raw) {
  const text = raw && typeof raw.text === 'string' ? raw.text.trim() : '';
  if (text.length < 20 || text.length > 700) throw new Error('Sample text failed validation.');
  return text;
}

async function generateSampleText({ kind, topic, motion, side }, opts) {
  if (!STATIC_SAMPLES[kind]) throw new Error('Unknown sample kind.');
  const o = opts || {};
  const config = o.config || getProviderConfig(o.env);
  if (!config) throw new Error('No LLM provider configured.');
  if (config.error) throw new Error(config.error);
  const provider = (o.providers || PROVIDER_MODULES)[config.name];
  if (!provider) throw new Error(`No implementation for provider "${config.name}".`);
  const text = await provider.complete({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    system: SYSTEM_PROMPT,
    user: buildSampleUser({ kind, topic, motion, side }),
    fetchImpl: o.fetchImpl,
    timeoutMs: o.timeoutMs,
  });
  return { text: validateText(parseJSON(text)), provider: config.name, model: config.model };
}

function staticSample(kind) {
  if (!STATIC_SAMPLES[kind]) throw new Error('Unknown sample kind.');
  return STATIC_SAMPLES[kind];
}

module.exports = { generateSampleText, staticSample, buildSampleUser, STATIC_SAMPLES };
