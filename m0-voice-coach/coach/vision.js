// Vision-augmented coaching (multimodal thin slice).
//
// When the user enables the camera, the browser captures up to 3 frames per
// attempt (start / finish / submit). If a vision provider is configured, ONE
// vision call produces the full analysis (same contract + visual_notes);
// otherwise the standard text-LLM → rules chain runs untouched.
//
// Honesty rules for vision (prompt-enforced + validated):
// - visual_notes ONLY for plainly observable facts ("looking down at notes
//   in 2 of 3 frames", "face not visible"). NEVER emotion, confidence,
//   nervousness, personality, or engagement inferred from frames.
// - Frames too dark/blurry/person-absent → say so, skip visual notes.
// - Faces are analyzed then discarded: frames are never stored (the client
//   strips them before localStorage; the server never persists them).

const { completeJSON } = require('./llm/chat');

const DEFAULT_VISION_MODEL = 'inclusionai/ling-3.0-flash-vl:free';

function getVisionConfig(env) {
  const e = env || process.env;
  // Vision currently routes via OpenRouter (Groq is text-only).
  const apiKey = e.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    name: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    model: e.COACH_VISION_MODEL || DEFAULT_VISION_MODEL,
  };
}

const VISION_SYSTEM = `You are a speech coach analyzing a voice-practice attempt. You receive the practice prompt, the speaker's complete finalized transcript, deterministic speech metrics, and up to 3 camera frames from the attempt.

STRICT RULES:
- Ground every claim in the transcript, metrics, or plainly visible frame content. Never invent words, events, or measurements.
- Distinguish measured facts from interpretation.
- Avoid generic praise like "Good job!". Be specific and concrete.
- Give ONE clear retry focus, not a long list.
- Never judge accent, intelligence, or personality.
- Never claim to measure emotion, body language, facial expression, pitch quality, or vocal confidence.
- VISUAL NOTES: only plainly observable facts (e.g. "looking down at notes in 2 of 3 frames", "face not visible in all frames", "holding papers"). NEVER infer emotion, confidence, nervousness, engagement, or personality from frames. If frames are dark, blurry, or show no person, say that and write no other visual notes.
- Keep each list item under 200 characters.

Respond with JSON ONLY, no markdown fences, exactly this shape:
{
  "strengths": ["..."],
  "areas_to_improve": ["..."],
  "actionable_feedback": ["..."],
  "retry_focus": { "focus": "...", "targets": ["wpm" | "fillerRatePer100" | "repeatCount" | "wordCount" | "fragmentCount" | "longSentenceCount"], "tip": "..." },
  "observations": ["..."],
  "visual_notes": ["..."]
}
1-3 items per list (visual_notes: 0-3). "targets" names the metrics the retry focus addresses (may be empty).`;

function slimMetrics(m) {
  return {
    durationSeconds: m.durationSec,
    wordCount: m.wordCount,
    wpm: m.wpm,
    fillers: m.fillerCount,
    fillerRatePer100: m.fillerRatePer100,
    repeats: m.repeatCount,
    sentences: m.sentenceCount,
    fragments: m.fragmentCount,
  };
}

function strList(value, name, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`Invalid "${name}": expected ${min}-${max} items.`);
  }
  return value.map((item) => {
    if (typeof item !== 'string' || !item.trim()) throw new Error(`Invalid "${name}" item.`);
    return item.trim().slice(0, 300);
  });
}

function validateVisionFeedback(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Feedback must be a JSON object.');
  const strengths = strList(raw.strengths, 'strengths', 1, 5);
  const areas_to_improve = strList(raw.areas_to_improve, 'areas_to_improve', 1, 5);
  const actionable_feedback = strList(raw.actionable_feedback, 'actionable_feedback', 1, 5);
  const rf = raw.retry_focus;
  if (!rf || typeof rf !== 'object' || Array.isArray(rf)) throw new Error('Invalid "retry_focus".');
  if (typeof rf.focus !== 'string' || !rf.focus.trim()) throw new Error('Invalid "retry_focus.focus".');
  const targets = Array.isArray(rf.targets) ? rf.targets.filter((t) => typeof t === 'string') : [];
  const tip = typeof rf.tip === 'string' ? rf.tip.trim().slice(0, 300) : '';
  const observations = Array.isArray(raw.observations)
    ? raw.observations.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim().slice(0, 300))
    : [];
  const visuals = Array.isArray(raw.visual_notes) ? raw.visual_notes : [];
  if (visuals.length > 3) throw new Error('Invalid "visual_notes": at most 3 items.');
  const visual_notes = visuals.map((v) => {
    if (typeof v !== 'string' || !v.trim()) throw new Error('Invalid "visual_notes" item.');
    return v.trim().slice(0, 300);
  });
  return {
    strengths,
    areas_to_improve,
    actionable_feedback,
    retry_focus: { focus: rf.focus.trim().slice(0, 300), targets, tip },
    observations: observations.map((text) => ({ type: 'derived', text })),
    visual_notes,
  };
}

function parseJSON(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

// Frames: data-URL JPEG/PNG strings, already capped by the caller.
function buildVisionMessages({ prompt, transcript, metrics, previous, frames }) {
  const input = {
    prompt: { title: prompt.title, objective: prompt.objective },
    attempt: { transcript, metrics: slimMetrics(metrics) },
    previousAttempt: null,
    retryNote: null,
    frameCount: frames.length,
  };
  if (previous) {
    input.previousAttempt = {
      transcript: previous.transcript,
      metrics: slimMetrics(previous.metrics),
      feedback: {
        strengths: previous.analysis.strengths,
        areas_to_improve: previous.analysis.areas_to_improve,
        retry_focus: previous.analysis.retry_focus,
      },
    };
    input.retryNote = 'This is a retry. Evaluate whether the previous retry focus was actually addressed, using the transcript and metrics as evidence. Numeric improvement is verified separately — describe what you observe, do not invent numbers.';
  }
  const content = [{ type: 'text', text: JSON.stringify(input) }];
  for (const f of frames) {
    content.push({ type: 'image_url', image_url: { url: f } });
  }
  return [{ role: 'user', content }];
}

async function analyzeWithVision({ prompt, transcript, metrics, previous, frames }, opts) {
  const o = opts || {};
  const config = o.config || getVisionConfig(o.env);
  if (!config) throw new Error('No vision provider configured.');
  if (config.error) throw new Error(config.error);
  const clean = (frames || []).filter((f) => typeof f === 'string' && f.startsWith('data:image/') && f.length <= 400000);
  if (clean.length === 0) throw new Error('No usable frames.');
  const fetchFn = o.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs || 90000);
  try {
    const res = await fetchFn(config.baseURL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
        'HTTP-Referer': 'https://localhost:3000/',
        'X-Title': 'Voice Coach M1',
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildVisionMessages({ prompt, transcript, metrics, previous, frames: clean }),
        temperature: 0.4,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Vision provider HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
    if (!text || typeof text !== 'string') throw new Error('Vision provider returned no message content.');
    const validated = validateVisionFeedback(parseJSON(text));
    return { ...validated, metrics, provider: config.name, model: config.model };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  analyzeWithVision, buildVisionMessages, validateVisionFeedback,
  getVisionConfig, DEFAULT_VISION_MODEL,
};
