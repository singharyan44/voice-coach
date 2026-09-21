// Provider configuration layer. Selects OpenRouter or Groq from env vars.
// Nothing here is hard-coded into the coaching logic: analyze code asks
// getProviderConfig() for { name, baseURL, apiKey, model } or null
// (null = no LLM configured → deterministic fallback).
//
//   COACH_PROVIDER=openrouter|groq   (default: openrouter)
//   COACH_MODEL=<model id>           (default per provider below)
//   OPENROUTER_API_KEY=...
//   GROQ_API_KEY=...

const { envVal } = require('../env');

const PROVIDERS = {
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'openrouter/free',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
    defaultModel: 'openai/gpt-oss-20b',
  },
};

function getProviderConfig(env) {
  const e = env || process.env;
  const name = String(envVal(e, 'COACH_PROVIDER') || 'openrouter').toLowerCase();
  const def = PROVIDERS[name];
  if (!def) return { error: `Unknown COACH_PROVIDER "${name}". Use "openrouter" or "groq".` };
  const apiKey = envVal(e, def.keyEnv);
  if (!apiKey) return null; // not configured → caller uses deterministic fallback
  const model = envVal(e, 'COACH_MODEL') || def.defaultModel;
  return { name, baseURL: def.baseURL, apiKey, model };
}

module.exports = { getProviderConfig, PROVIDERS };
