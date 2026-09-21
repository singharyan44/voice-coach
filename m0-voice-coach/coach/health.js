// Deployment self-checks for M1.
//
// buildHealth() reports which backends are configured so the UI (and the
// user) can tell a missing key from a broken pipeline at a glance.
// Presence booleans ONLY — key values must never leave the server.

function buildHealth(env) {
  const e = env || process.env;
  const assemblyai = !!(e.ASSEMBLYAI_API_KEY && String(e.ASSEMBLYAI_API_KEY).trim());
  const provider = String(e.COACH_PROVIDER || 'openrouter').toLowerCase();
  const llmKey = provider === 'groq' ? e.GROQ_API_KEY : e.OPENROUTER_API_KEY;
  const llm = !!(llmKey && String(llmKey).trim());
  return {
    ok: assemblyai,
    speech: assemblyai ? 'ready' : 'missing-key',
    coach: llm ? `ai-${provider}` : 'rules',
    coachModel: llm ? (e.COACH_MODEL || '(default)') : null,
  };
}

module.exports = { buildHealth };
