# Voice Coach — 9-Day Milestone Plan (v3)

Context: **lablab AssemblyAI hackathon**. Thesis (the product): **the training
loop itself** — Challenge → Speak → Observe → Diagnose → Coach → Retry →
Measure improvement → Adapt the next challenge. Not "AI analyzes your voice."

Target, precisely: **not the whole AI communication platform — enough of the
adaptive training engine that someone experiences why the larger platform
should exist.** (The practice→feedback→retry→adapt loop already appears in
products like Debatable/LogiCoach, so the differentiator must be the
*adaptation over sessions*, not merely having an AI debate mode.)

Budget honesty: M1 cost ~10–12 focused hours. The remaining days are NOT 8×
that — context switching, debugging, deployment, and complexity eat time.
Plan for ~25–30 focused hours total: enough for a serious jump to a
convincing adaptive prototype.

Day 0 (done): M1 Speech Coach loop + deployment + profile-lite memory.
We have 9 days total (Day 0 banked + 8 ahead).

## Shared architecture (the real product)
```text
TrainingEngine  (Challenge → Respond → Observe → Diagnose →
                 Coach → Retry → Compare → Next challenge)
├── SpeechCoach   ✅ live
├── DebateCoach   ← Days 3–5
└── InterviewCoach ← stretch only (possible, not built)
```
Every mode reuses: AssemblyAI streaming transport, AttemptRecorder boundary
semantics, metrics, coach-engine routing (AI/Rules), deterministic compare,
profile aggregation.

## Day 1 — Memory ✅ DONE
History (localStorage) + `coach/profile.js` (strengths / recurring
weaknesses / top focus / trends) + History + Profile panels.

## Day 2 — Adaptation ✅ DONE (no mastery system, just weakest-link)
- `coach/assign.js`: weakest skill → targeted prompt (drills preferred) +
  one-sentence reason citing the counts. 12-prompt library tagged by skill.
- `POST /api/assign` (stateless) + sessions accept `promptId`.
- UI: "Up next — assigned for you" card + Practice-this flow.
- Validated: 97/97 unit tests, DOM check, live assign + promptId session.

## Days 3–5 — Debate Coach v1 (flagship: training partner, NOT sparring bot)
- Loop: user argues → opponent identifies the actual argument → attacks its
  weakest component (unsupported claim / weak evidence / contradiction /
  unanswered rebuttal) → user responds → coach diagnoses the exchange →
  next drill targets the demonstrated weakness.
- Done when: argue → challenged on YOUR specific weakness → respond →
  re-analysis shows movement.

## Day 6 — Integration + demo path (not mobile polish)
Make the complete journey stupidly obvious, first visit to profile update:
Speak → Feedback → Retry → "X is still weak" → targeted exercise → Debate →
opponent attacks YOUR argument → Feedback → Retry → Profile updated.
Polish only with leftover time. Mobile: test, fix blockers, nothing more.

## Day 7 — Demo prep + hardening
90-second script following the Day 6 journey, dry runs, every fallback path.

## Day 8 — Buffer (the +1 day)
Whatever is on fire. If nothing is: Interview Coach spike (engine is ready)
or visual polish. Submit at end of day. 🎉

## Explicitly OUT
Full curriculum math, multimodal build (spike only if ahead — Groq is
text-only, OpenRouter free was flaky; claims constrained to evidence either
way), native apps, auth/payments, hand-rolled audio DSP.

## Standing rules
I build, you test + paste logs. Deterministic metrics/compare stay; LLM
never overrides numbers. Scope creep waits. AssemblyAI stays the
speech layer in every mode (hackathon track alignment).
