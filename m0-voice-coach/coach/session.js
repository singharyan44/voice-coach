// In-memory session store for M1.
//
//   Session → Prompt → Attempt 1 → Analysis 1 → Attempt 2 → Analysis 2 → Comparison
//
// Deliberately in-memory: no persistence in M1. The store is isolated behind
// create/get/add functions so a file- or DB-backed store can replace it in M2
// without touching the API layer or coaching logic.

const sessions = new Map();

function makeId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Build an attempt object without touching the store. Serverless hosts
// (Vercel) don't share memory between requests, so attempts must also work
// statelessly: the client sends the previous attempt, the server numbers the
// new one from it and returns the comparison inline.
function makeAttempt(n, { transcript, durationMs, turnCount, metrics, analysis }) {
  return {
    n,
    id: makeId('a'),
    transcript,
    durationMs,
    turnCount,
    metrics,
    analysis,
    createdAt: new Date().toISOString(),
  };
}

function createSession(prompt) {
  const session = {
    id: makeId('s'),
    prompt,
    attempts: [],
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id) || null;
}

function addAttempt(sessionId, { transcript, durationMs, turnCount, metrics, analysis }) {
  const session = getSession(sessionId);
  if (!session) return null;
  const attempt = makeAttempt(session.attempts.length + 1, { transcript, durationMs, turnCount, metrics, analysis });
  session.attempts.push(attempt);
  return attempt;
}

module.exports = { createSession, getSession, addAttempt, makeAttempt };
