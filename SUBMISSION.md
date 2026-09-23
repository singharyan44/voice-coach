# Voice Coach — Hackathon Submission Pack (MVP)

## Links
- Live demo: https://voice-coach-seven.vercel.app
- Repo: https://github.com/singharyan44/voice-coach

## Tagline
A real-time voice coach: speak, get specific feedback, retry, and see exactly
what improved — powered by AssemblyAI streaming transcription.

## Description (copy-paste)
Voice Coach turns speaking practice into a measurable, adaptive loop. Pick a
prompt, speak, and get instant analysis grounded in real metrics — pace (WPM),
filler words, repeated words, and sentence structure — never generic praise.
Each attempt ends with one clear retry focus; speak again and the app compares
both attempts side by side. The system tracks your profile across sessions
and assigns the next exercise targeting YOUR weakest skill. Two more coaches
share the same engine: Debate Coach argues against you, attacking your
argument's weakest component, and Interview Coach runs adaptive interviews
with pressure follow-ups. Choose AI coaching (Groq/OpenRouter) with automatic
truthful fallback to a built-in deterministic coach. Test everything hands-free
with AI-written sample clips the app reads aloud for your mic.

## 60-second demo script
1. Open the live URL — point out the Speech Coach label + system status line.
2. Press Connect (live AssemblyAI transcription starts).
3. Start attempt → play Sample 1 → Finish → feedback with metrics + retry focus.
4. Try again → Sample 2 → Finish → comparison showing improvement.
5. Mention: AI/Rules coach engine selector with truthful fallback badges.

## Tech stack
Node.js + Express, AssemblyAI Universal-3.5 Pro Streaming (16 kHz PCM16),
Groq/OpenRouter LLMs, vanilla JS frontend, Vercel + GitHub.

## Known MVP limitations (honest)
- Attempt history lives in the page session (refresh clears it).
- AI coaching needs provider keys; otherwise the deterministic coach serves.
- Best on desktop Chrome/Edge; mobile works but is less polished.
