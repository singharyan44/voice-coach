// Minimal OpenAI-compatible chat-completions caller shared by providers.
// Single non-streamed request. Throws on any failure — the caller falls back
// to the deterministic analyzer. Never logs or returns the API key.
async function completeJSON({ baseURL, apiKey, model, system, user, extraHeaders, fetchImpl, timeoutMs }) {
  const fetchFn = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 45000);
  try {
    const res = await fetchFn(baseURL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
        ...(extraHeaders || {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.4,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Provider HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
    if (!text || typeof text !== 'string') throw new Error('Provider returned no message content.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { completeJSON };
