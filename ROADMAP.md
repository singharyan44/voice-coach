# Voice Coach — 8-Day Milestone Plan

Where we are: **M1 done and deployed.** Speech Coach loop (Prompt → Speak →
Feedback → Retry → Comparison), Rules + AI coach engine selector, hands-free
test samples, GitHub + Vercel live.

How we work: I build, you test in the browser and paste logs. No code edits
needed from you, ever.

## Day 1 — Memory (history that survives refresh)
- **Goal:** attempts persist in the browser (localStorage): history list,
  per-attempt metrics, past comparisons viewable after reload.
- **You test:** do 2 attempts, reload the page, history still there.
- **Done when:** refresh loses nothing; no backend storage needed (free tier safe).

## Day 2 — Reliability + content
- **Goal:** auto-reconnect on dropped connections, clear mic-error states,
  prompt library grows to ~12, one new sample clip.
- **You test:** kill Wi-Fi mid-attempt → clean recovery message, no stuck UI.
- **Done when:** every failure state says what happened and what to press next.

## Day 3–4 — Meeting Notetaker mode (product mode #2)
- **Goal:** continuous capture (no Start/Finish), live running transcript,
  LLM summary + action items on Stop, copy/export as text.
  Reuses the existing transport + LLM layer; separate page section, Speech
  Coach untouched.
- **You test:** record a 5-minute monologue (or play a podcast into it),
  check summary quality.
- **Done when:** Stop → readable summary + action list, copyable in one click.

## Day 5 — Coach quality + sharing
- **Goal:** export feedback/comparison as text, retry streaks, first-run
  onboarding hints, prompt-objective matching in analysis ("did you answer
  the actual prompt?").
- **You test:** export an attempt, confirm a friend could understand it.
- **Done when:** a full session can be shared as one readable text.

## Day 6 — Mobile + polish
- **Goal:** fully usable on a phone browser (the real demo device), touch
  targets, layout, mic permission flow on mobile Safari/Chrome.
- **You test:** entire loop on your phone, report anything broken/ugly.
- **Done when:** phone loop works end to end.

## Day 7 — Demo prep
- **Goal:** 90-second demo script, dry run, kill every fallback path
  (no-key, provider-down, offline), README demo section.
- **You test:** run the script twice, time it.
- **Done when:** demo works twice in a row without me touching anything.

## Day 8 — Buffer + submit
- **Goal:** fix whatever Day 7 broke, submit the hackathon entry, backup notes.
- **Done when:** submitted. 🎉

## Deliberately OUT (not in 8 days)
Auth/accounts, payments, teams/social, Debate/Interview/Singing coaches,
native mobile apps, custom domain (optional nice-to-have if time appears).

## Risks + answers
- **LLM provider flakiness** (seen live) → Rules fallback already covers it;
  Day 7 hardens every path.
- **Vercel serverless limits** → stateless API already; localStorage avoids
  backend storage entirely.
- **Scope creep** → anything not on its day's list waits. You have veto power.

## Decision points for you (no rush)
1. After Day 4: is Notetaker actually useful, or cut it for more polish?
2. Day 6: do we want a third mode (Interview Coach is the natural next), or
   is two modes + polish the stronger demo?
