require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const { pickPrompt } = require('../coach/prompts');
const { createSession, getSession, addAttempt } = require('../coach/session');
const { computeMetrics } = require('../coach/metrics');
const { analyzeAttempt } = require('../coach/analyze');
const { analyzeWithLLM } = require('../coach/llm-analyze');
const { getProviderConfig } = require('../coach/llm/provider');
const { analyzeAttemptForSession } = require('../coach/coach-engine');
const { buildHealth } = require('../coach/health');
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

// Start a practice session with a prompt.
app.post('/api/sessions', (req, res) => {
  const excludeId = req.body && req.body.excludePromptId;
  const prompt = pickPrompt(excludeId);
  const session = createSession(prompt);
  res.json({ sessionId: session.id, prompt: session.prompt });
});

// Submit a finalized attempt: joined finalized Turns + client-measured timing.
app.post('/api/sessions/:id/attempts', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Unknown session. Start a new practice session.' });

  const transcript = ((req.body && req.body.transcript) || '').trim();
  if (!transcript) return res.status(400).json({ error: 'Empty transcript — speak before finishing the attempt.' });

  const durationMs = Number(req.body.durationMs);
  const turnCount = Number(req.body.turnCount);
  const metrics = computeMetrics({
    transcript,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0,
    turnCount: Number.isFinite(turnCount) && turnCount >= 0 ? turnCount : 0,
  });

  // Coach engine selected in the UI ('ai' default). Rules never touches the
  // LLM; AI falls back to rules on any provider failure. compare.js stays
  // deterministic either way.
  const requestedEngine = req.body && req.body.coachEngine === 'rules' ? 'rules' : 'ai';
  const prev = session.attempts.length > 0 ? session.attempts[session.attempts.length - 1] : null;
  const previous = prev ? {
    transcript: prev.transcript,
    metrics: prev.metrics,
    analysis: {
      strengths: prev.analysis.strengths,
      areas_to_improve: prev.analysis.areas_to_improve,
      retry_focus: prev.analysis.retry_focus,
    },
  } : null;
  const routed = await analyzeAttemptForSession({
    engine: requestedEngine,
    prompt: session.prompt,
    transcript,
    metrics,
    previous,
    llmAnalyze: analyzeWithLLM,
    rulesAnalyze: analyzeAttempt,
  });
  if (routed.fallback) {
    // Server-side log keeps the detail; the client gets a generic truthful flag.
    console.error('LLM coach unavailable, using deterministic fallback:', routed.fallbackReason);
  }
  const analysis = routed.analysis;
  const coachSource = routed.coachSource;

  const attempt = addAttempt(session.id, { transcript, durationMs: metrics.durationSec * 1000, turnCount: metrics.turnCount, metrics, analysis });
  res.json({ attempt, analysis, coachSource, requestedEngine: routed.requested });
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