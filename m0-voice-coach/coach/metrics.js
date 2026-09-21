// Measured speech metrics derived from a finalized transcript + timing.
// Everything here is computed from observable data only:
//   - transcript text (AssemblyAI finalized Turns joined together)
//   - durationMs (wall-clock time of the attempt, measured client-side)
//   - turnCount (how many finalized Turns the attempt contained)
//
// Nothing here claims to measure confidence, pitch, emotion, or body language.

const FILLERS = [
  'um', 'uh', 'er', 'ah', 'hmm', 'huh',
  'like', 'basically', 'actually', 'literally',
  'you know', 'i mean', 'kind of', 'sort of', 'let me think',
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripPunct(token) {
  return token.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '');
}

function splitSentences(text) {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => ({
      text: s,
      words: s.split(/\s+/).filter(Boolean).length,
      terminated: /[.!?]$/.test(s),
    }));
}

function computeMetrics({ transcript, durationMs, turnCount }) {
  const text = (transcript || '').trim();
  const lower = text.toLowerCase();
  const rawTokens = text.split(/\s+/).filter(Boolean);
  const words = rawTokens.map(stripPunct).filter(Boolean);
  const wordCount = words.length;

  const durationSec = durationMs > 0 ? durationMs / 1000 : 0;
  const wpm = durationSec > 0 && wordCount > 0 ? Math.round(wordCount / (durationSec / 60)) : null;

  // Filler words/phrases (approximate: "like" etc. have legitimate uses).
  const fillersFound = [];
  let fillerCount = 0;
  for (const phrase of FILLERS) {
    const re = new RegExp('\\b' + escapeRegExp(phrase) + '\\b', 'gi');
    const hits = lower.match(re);
    if (hits) {
      fillerCount += hits.length;
      fillersFound.push({ phrase, count: hits.length });
    }
  }
  fillersFound.sort((a, b) => b.count - a.count);
  const fillerRatePer100 = wordCount > 0 ? Math.round((fillerCount / wordCount) * 1000) / 10 : 0;

  // Consecutive repeated words ("I I", "the the") — a restart signal.
  let repeatCount = 0;
  const repeatExamples = [];
  for (let i = 1; i < words.length; i++) {
    if (words[i].toLowerCase() === words[i - 1].toLowerCase()) {
      repeatCount++;
      if (repeatExamples.length < 3) repeatExamples.push(words[i - 1] + ' ' + words[i]);
    }
  }

  const sentences = splitSentences(text);
  const longSentenceCount = sentences.filter((s) => s.words > 25).length;
  const fragmentCount = sentences.filter((s) => s.words < 5 && !s.terminated).length;
  const avgSentenceLen = sentences.length > 0
    ? Math.round((wordCount / sentences.length) * 10) / 10
    : 0;

  // Literal hesitation markers in the text (rare in formatted transcripts; may be 0).
  const hesitationCount = (text.match(/--|\.\.\.|…/g) || []).length;

  const safeTurnCount = Number.isFinite(turnCount) && turnCount > 0 ? Math.floor(turnCount) : 0;
  const avgWordsPerTurn = safeTurnCount > 0 ? Math.round((wordCount / safeTurnCount) * 10) / 10 : 0;

  return {
    durationSec: Math.round(durationSec * 10) / 10,
    wordCount,
    wpm,
    fillerCount,
    fillerRatePer100,
    fillersFound,
    repeatCount,
    repeatExamples,
    sentenceCount: sentences.length,
    avgSentenceLen,
    longSentenceCount,
    fragmentCount,
    hesitationCount,
    turnCount: safeTurnCount,
    avgWordsPerTurn,
  };
}

module.exports = { computeMetrics, FILLERS };
