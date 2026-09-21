# Voice Coach — 8-Day Milestone Plan (v2: long-term vision aligned)

Thesis (the product): **the training loop itself** —
Challenge → Speak → Observe → Diagnose → Coach → Retry →
Measure improvement → Adapt the next challenge.
Not "AI analyzes your voice."

M1 proved the smallest version: speak → targeted feedback → retry →
measurable change. Everything below grows around that loop.

## Day 1 — Memory (profile lite) ✅ DONE
- Attempts persist in browser localStorage (survive reload, free-tier safe).
- `coach/profile.js`: strengths (good in ≥60% of attempts), recurring
  weaknesses (flagged in ≥2), metric trends, totals. Deterministic, tested.
- UI: History list + Your Profile panel. `POST /api/profile` (stateless).
- Validated: 87/87 unit tests, DOM check, live profile endpoint.

## Day 2 — Adaptive next challenge
- Weakest-skill → targeted prompt selection; prompt library to ~12.
- Done when: the app assigns practice instead of you picking randomly.

## Day 3–5 — Debate Coach v1 (flagship differentiator)
- Same engine, new role: the AI is the **opponent**, not a rater.
- Detects unsupported claims, weak evidence, contradictions, unanswered
  rebuttals; generates the next challenge around YOUR weakness; re-measures.
- Done when: argue → challenged on a specific weakness → respond →
  re-analysis shows movement.

## Day 6 — Unified shell + mobile + multimodal SPIKE
- Mode tabs (Speech / Debate), shared engine interface, phone polish.
- **Multimodal spike (timeboxed, ~2 hrs):** verify a vision-capable model
  answers through our provider layer (Groq is text-only; OpenRouter free was
  flaky — confirm first). Claims constrained to observable evidence only.
- Build multimodal ONLY if the spike passes; else the time goes to polish.

## Day 7 — Demo prep (+ multimodal build if spiked green)
- 90-second script, dry runs, every fallback path hardened.

## Day 8 — Buffer + submit. 🎉

## Explicitly OUT
Full curriculum/skill-graph math, Interview Coach (stretch — shares ~70% of
the debate engine, builds cheap IF debate lands early), native apps, auth,
payments, hand-rolled audio DSP (a VLM that sees frames is fine; invented
pitch/confidence numbers are not).

## Standing rules
I build, you test + paste logs. No code edits from you. Scope creep waits.
Deterministic metrics/comparison stay; LLM never overrides numbers.
