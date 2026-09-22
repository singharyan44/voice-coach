require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const { pickPrompt, getPrompt } = require('../coach/prompts');
const { createSession, getSession, addAttempt, makeAttempt } = require('../coach/session');
const { computeMetrics } = require('../coach/metrics');
const { analyzeAttempt } = require('../coach/analyze');
const { analyzeWithLLM } = require('../coach/llm-analyze');
const { getProviderConfig } = require('../coach/llm/provider');
const { analyzeAttemptForSession } = require('../coach/coach-engine');
const { buildHealth } = require('../coach/health');
const { buildProfile } = require('../coach/profile');
const { assignNext } = require('../coach/assign');
const { compareAttempts } = require('../coach/compare');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ASSEMBLYAI_API_KEY;

if (!API_KEY) {
  console.error('Missing ASSEMBLYAI_API_KEY. Copy .env.example to .env and set your key.');
  process.exit(1);
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

// Streaming token endpoint (Universal-3 Pro Streaming)
app.get('/token', async (req, res) => {
  try {
    const url = new URL('https://streaming.assemblyai.com/v3/token');
    url.searchParams.set('expires_in_seconds', '300');
    url.searchParams.set('max_session_duration_seconds', '8640');

    const response = await fetch(url, {
      headers: { Authorization: API_KEY }, // no Bearer prefix
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Token endpoint error:', response.status, text);
      return res.status(response.status).send(text);
    }

    const data = await response.json();
    res.json({ token: data.token });
  } catch (err) {
    console.error('Token fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch token', message: err.message });
  }
});

// Local runs (`npm start`) listen here. Serverless hosts (Vercel
// @vercel/node) require() this file instead, so skip listening there.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Voice Coach M1 running at http://localhost:${PORT}`);
    console.log(`Token endpoint: http://localhost:${PORT}/token`);
    const coachCfg = getProviderConfig();
    console.log('Coach provider: ' + (coachCfg && !coachCfg.error
      ? coachCfg.name + ' / ' + coachCfg.model
      : 'none (deterministic rules)'));
  });
}

// Exported for serverless hosting (Vercel @vercel/node).
module.exports = app;

// ---------------- M1 coaching API (additive; /token + static untouched) ----------------

// Deployment self-check: which backends are configured (presence only,
// never key values). The UI shows this on load so a missing key explains
// itself instead of surfacing later as a cryptic token/analysis error.
app.get('/api/health', (req, res) => {
  res.json(buildHealth());
});

// Personal profile from a client-held history (stateless: the browser owns
// the attempt list in localStorage, the server only aggregates it).
app.post('/api/profile', (req, res) => {
  const attempts = req.body && Array.isArray(req.body.attempts) ? req.body.attempts.slice(0, 200) : [];
  res.json({ profile: buildProfile(attempts) });
});

// Start a practice session with a prompt. Accepts { promptId } to practice a
// specific (e.g. assigned) prompt, or { excludePromptId } for a random one.
app.post('/api/sessions', (req, res) => {
  const body = req.body || {};
  const prompt = (body.promptId && getPrompt(body.promptId)) || pickPrompt(body.excludePromptId);
  const session = createSession(prompt);
  res.json({ sessionId: session.id, prompt: session.prompt });
});

// Adaptive assignment: weakest skill → targeted next exercise. Stateless —
// the browser sends its history, the server answers with prompt + reason.
app.post('/api/assign', (req, res) => {
  const body = req.body || {};
  const attempts = Array.isArray(body.attempts) ? body.attempts.slice(0, 200) : [];
  const assigned = assignNext(attempts, body.excludePromptId || null);
  res.json({ prompt: assigned.prompt, reason: assigned.reason, weakest: assigned.weakest });
});

// Submit a finalized attempt: joined finalized Turns + client-measured timing.
//
// Stateless by design: serverless hosts don't share memory between requests,
// so the session is OPTIONAL. The client sends `previous` (its last attempt)
// on retries; the server numbers from it and returns the comparison inline.
// When a live session exists (local dev) the attempt is also stored there.
app.post('/api/sessions/:id/attempts', async (req, res) => {
  const session = getSession(req.params.id);

  const transcript = ((req.body && req.body.transcript) || '').trim();
  if (!transcript) return res.status(400).json({ error: 'Empty transcript — speak before finishing the attempt.' });

  const durationMs = Number(req.body.durationMs);
  const turnCount = Number(req.body.turnCount);
  const metrics = computeMetrics({
    transcript,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0,
    turnCount: Number.isFinite(turnCount) && turnCount >= 0 ? turnCount : 0,
  });

  // Retry context: prefer the client-sent previous (works across serverless
  // instances), fall back to the in-memory session (local dev).
  const bodyPrev = req.body && req.body.previous;
  let prev = null;
  if (bodyPrev && typeof bodyPrev.transcript === 'string' && bodyPrev.transcript.trim() && bodyPrev.analysis && bodyPrev.metrics) {
    prev = {
      n: Number.isFinite(bodyPrev.n) ? Math.floor(bodyPrev.n) : 1,
      transcript: bodyPrev.transcript,
      metrics: bodyPrev.metrics,
      analysis: {
        strengths: bodyPrev.analysis.strengths || [],
        areas_to_improve: bodyPrev.analysis.areas_to_improve || [],
        retry_focus: bodyPrev.analysis.retry_focus || null,
      },
    };
  } else if (session && session.attempts.length > 0) {
    const last = session.attempts[session.attempts.length - 1];
    prev = {
      n: last.n,
      transcript: last.transcript,
      metrics: last.metrics,
      analysis: {
        strengths: last.analysis.strengths,
        areas_to_improve: last.analysis.areas_to_improve,
        retry_focus: last.analysis.retry_focus,
      },
    };
  }

  // Coach engine selected in the UI ('ai' default). Rules never touches the
  // LLM; AI falls back to rules on any provider failure. compare.js stays
  // deterministic either way.
  const requestedEngine = req.body && req.body.coachEngine === 'rules' ? 'rules' : 'ai';
  const routed = await analyzeAttemptForSession({
    engine: requestedEngine,
    prompt: session ? session.prompt : { title: 'Practice', objective: '' },
    transcript,
    metrics,
    previous: prev,
    llmAnalyze: analyzeWithLLM,
    rulesAnalyze: analyzeAttempt,
  });
  if (routed.fallback) {
    // Server-side log keeps the detail; the client gets a generic truthful flag.
    console.error('LLM coach unavailable, using deterministic fallback:', routed.fallbackReason);
  }
  const analysis = routed.analysis;
  const coachSource = routed.coachSource;

  const n = prev ? prev.n + 1 : 1;
  const attempt = session
    ? addAttempt(session.id, { transcript, durationMs: metrics.durationSec * 1000, turnCount: metrics.turnCount, metrics, analysis }) || makeAttempt(n, { transcript, durationMs: metrics.durationSec * 1000, turnCount: metrics.turnCount, metrics, analysis })
    : makeAttempt(n, { transcript, durationMs: metrics.durationSec * 1000, turnCount: metrics.turnCount, metrics, analysis });

  // Comparison rides along with attempt 2+ so retries need no extra round
  // trip and no shared server memory. prev.analysis travels light (no
  // metrics inside), so reattach prev.metrics before comparing.
  let comparison = null;
  if (prev && prev.metrics && prev.analysis && prev.analysis.retry_focus) {
    comparison = compareAttempts({ ...prev.analysis, metrics: prev.metrics }, analysis, prev.analysis.retry_focus);
  }

  res.json({ attempt, analysis, coachSource, requestedEngine: routed.requested, comparison });
});

// Compare the last two attempts of a session.
app.get('/api/sessions/:id/comparison', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Unknown session. Start a new practice session.' });
  if (session.attempts.length < 2) {
    return res.status(400).json({ error: 'Need at least two attempts before comparing.' });
  }
  const prev = session.attempts[session.attempts.length - 2];
  const curr = session.attempts[session.attempts.length - 1];
  res.json(compareAttempts(prev.analysis, curr.analysis, prev.analysis.retry_focus));
});