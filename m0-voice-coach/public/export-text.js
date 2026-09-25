// Session export builder (pure, unit-tested): history + profile → one
// readable plain-text document a friend could understand without the app.
// UMD: browser global via <script> tag, require()-able in Node for tests.

function lines(text) {
  return String(text || '').split('\n');
}

function buildSessionText({ history, profile, generatedAt }) {
  const out = [];
  out.push('VOICE COACH — PRACTICE SESSION');
  out.push('Exported: ' + (generatedAt || new Date().toISOString()));
  out.push('');
  if (profile && profile.totalAttempts > 0) {
    out.push('YOUR PROFILE (' + profile.totalAttempts + ' attempts)');
    for (const s of profile.strengths || []) out.push('  Strength: ' + s.label + ' (' + s.good + '/' + s.total + ')');
    for (const s of profile.recurringWeaknesses || []) out.push('  Recurring weakness: ' + s.label + ' (' + (s.total - s.good) + '/' + s.total + ' flagged)');
    if (profile.topFocus) out.push('  Training focus: ' + profile.topFocus.target + ' (flagged ' + profile.topFocus.times + 'x)');
    out.push('');
  }
  const list = history || [];
  if (!list.length) {
    out.push('No attempts recorded yet.');
    return out.join('\n');
  }
  list.forEach((a, i) => {
    const m = a.metrics || {};
    const when = a.createdAt ? new Date(a.createdAt).toLocaleString() : '';
    out.push(`--- Attempt ${i + 1}: ${a.promptTitle || 'Practice'} (${when}) ---`);
    out.push(`Metrics: ${m.wordCount || 0} words, ${m.wpm == null ? 'n/a' : m.wpm + ' wpm'}, ${m.fillerCount || 0} fillers, ${m.repeatCount || 0} repeats. Coach: ${a.coachSource === 'llm' ? 'AI' : 'Rules'}.`);
    out.push('Said: ' + (a.transcript || '(no transcript)'));
    const an = a.analysis || {};
    for (const s of an.strengths || []) out.push('  + ' + s);
    for (const s of an.areas_to_improve || []) out.push('  - ' + s);
    if (an.retry_focus && an.retry_focus.focus) out.push('  Retry focus: ' + an.retry_focus.focus);
    out.push('');
  });
  return out.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildSessionText, verdictSummary };
}

// Today's verdict from a comparison: counts + the bottleneck (first worse,
// else first same, else null). Presentational grouping only — verdicts
// themselves stay deterministic in coach/compare.js.
function verdictSummary(comparison) {
  const c = comparison || {};
  const improved = Array.isArray(c.improved) ? c.improved : [];
  const worse = Array.isArray(c.worse) ? c.worse : [];
  const same = Array.isArray(c.same) ? c.same : [];
  return {
    improvedCount: improved.length,
    worseCount: worse.length,
    bottleneck: worse.length ? worse[0].detail : (same.length ? same[0].detail : null),
  };
}
