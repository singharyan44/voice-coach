// Attempt comparison for M1.
//
// compareAttempts(prevAnalysis, currAnalysis, prevRetryFocus) -> {
//   improved: [{ metric, detail }],
//   same:     [{ metric, detail }],
//   worse:    [{ metric, detail }],
//   retry_focus_addressed,  // true/false/null (null = not enough data)
//   next_focus              // the current attempt's retry_focus
// }
//
// Rules:
// - Every verdict must come from a real metric delta. Noise bands keep tiny
//   wobbles in "same" instead of inventing improvement.
// - retry_focus_addressed checks the previous retry_focus.targets against the
//   verdicts: true only if every targeted metric improved or was already in a
//   good range; false if any targeted metric got worse or stayed bad.

function paceDistance(wpm) {
  if (wpm == null) return null;
  if (wpm >= 100 && wpm <= 170) return 0;
  return Math.min(Math.abs(wpm - 100), Math.abs(wpm - 170));
}

function inGoodRange(key, metrics) {
  switch (key) {
    case 'fillerRatePer100': return metrics.fillerRatePer100 <= 3;
    case 'wpm': return metrics.wpm != null && metrics.wpm >= 100 && metrics.wpm <= 170;
    case 'repeatCount': return metrics.repeatCount === 0;
    case 'fragmentCount': return metrics.fragmentCount === 0;
    case 'longSentenceCount': return metrics.longSentenceCount === 0;
    case 'wordCount': return metrics.wordCount >= 20;
    default: return false;
  }
}

function compareAttempts(prevAnalysis, currAnalysis, prevRetryFocus) {
  const p = prevAnalysis.metrics;
  const c = currAnalysis.metrics;
  const improved = [];
  const same = [];
  const worse = [];
  const verdictByMetric = {};

  const verdict = (key, result, detail) => {
    verdictByMetric[key] = result;
    const entry = { metric: key, detail };
    if (result === 'improved') improved.push(entry);
    else if (result === 'worse') worse.push(entry);
    else same.push(entry);
  };

  // Fillers: rate per 100 words, ±1.0 band.
  if (p.wordCount > 0 && c.wordCount > 0) {
    const d = c.fillerRatePer100 - p.fillerRatePer100;
    if (d <= -1) verdict('fillerRatePer100', 'improved', `Filler rate fell from ${p.fillerRatePer100} to ${c.fillerRatePer100} per 100 words.`);
    else if (d >= 1) verdict('fillerRatePer100', 'worse', `Filler rate rose from ${p.fillerRatePer100} to ${c.fillerRatePer100} per 100 words.`);
    else verdict('fillerRatePer100', 'same', `Filler rate held steady (${p.fillerRatePer100} → ${c.fillerRatePer100} per 100 words).`);
  }

  // Pace: distance from the 100–170 band, ±5 band.
  {
    const pd = paceDistance(p.wpm);
    const cd = paceDistance(c.wpm);
    if (pd == null || cd == null) {
      verdict('wpm', 'same', 'Pace could not be compared (missing timing data).');
    } else if (cd <= pd - 5) {
      verdict('wpm', 'improved', `Pace moved toward conversational range (${p.wpm} → ${c.wpm} wpm).`);
    } else if (cd >= pd + 5) {
      verdict('wpm', 'worse', `Pace moved away from conversational range (${p.wpm} → ${c.wpm} wpm).`);
    } else {
      verdict('wpm', 'same', `Pace stayed similar (${p.wpm} → ${c.wpm} wpm).`);
    }
  }

  // Repeats: exact counts, any change counts.
  if (c.repeatCount < p.repeatCount) verdict('repeatCount', 'improved', `Repeats dropped from ${p.repeatCount} to ${c.repeatCount}.`);
  else if (c.repeatCount > p.repeatCount) verdict('repeatCount', 'worse', `Repeats rose from ${p.repeatCount} to ${c.repeatCount}.`);
  else verdict('repeatCount', 'same', p.repeatCount === 0 ? 'Still zero repeated words.' : `Repeats unchanged at ${p.repeatCount}.`);

  // Structure: fragments + long sentences combined.
  {
    const ps = p.fragmentCount + p.longSentenceCount;
    const cs = c.fragmentCount + c.longSentenceCount;
    if (cs < ps) verdict('structure', 'improved', `Sentence structure tightened (${ps} → ${cs} fragments/overlong sentences).`);
    else if (cs > ps) verdict('structure', 'worse', `Sentence structure loosened (${ps} → ${cs} fragments/overlong sentences).`);
    else verdict('structure', 'same', ps === 0 ? 'Sentences stayed complete and well-sized.' : `Structure issues unchanged (${ps}).`);
  }

  // Substance: only verdict when the change is meaningful.
  if (p.wordCount < 30 && c.wordCount - p.wordCount >= 10) {
    verdict('wordCount', 'improved', `Fuller answer this time (${p.wordCount} → ${c.wordCount} words).`);
  } else if (c.wordCount < 20 && p.wordCount - c.wordCount >= 10) {
    verdict('wordCount', 'worse', `Much shorter this time (${p.wordCount} → ${c.wordCount} words).`);
  } else {
    verdict('wordCount', 'same', `Similar length (${p.wordCount} → ${c.wordCount} words).`);
  }

  // Did the retry address the previous focus?
  let retryFocusAddressed = null;
  const targets = (prevRetryFocus && prevRetryFocus.targets) || [];
  if (targets.length > 0) {
    const mapped = targets.map((t) => (t === 'fragmentCount' || t === 'longSentenceCount' ? 'structure' : t));
    const unique = [...new Set(mapped)];
    const known = unique.filter((t) => verdictByMetric[t]);
    if (known.length > 0) {
      if (known.some((t) => verdictByMetric[t] === 'worse')) {
        retryFocusAddressed = false;
      } else if (known.every((t) => verdictByMetric[t] === 'improved' || inGoodRange(t === 'structure' ? 'fragmentCount' : t, c) || (t === 'structure' && inGoodRange('fragmentCount', c) && inGoodRange('longSentenceCount', c)))) {
        retryFocusAddressed = true;
      } else {
        retryFocusAddressed = false;
      }
    }
  }

  return {
    improved,
    same,
    worse,
    retry_focus_addressed: retryFocusAddressed,
    next_focus: currAnalysis.retry_focus,
  };
}

module.exports = { compareAttempts };
