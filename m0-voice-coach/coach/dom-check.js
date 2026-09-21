// DOM cross-check: every getElementById in script.js must exist in index.html,
// and every <script src> must resolve to a real file. Run: node coach/dom-check.js
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(pub, 'script.js'), 'utf8');

const htmlIds = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const jsIds = [...new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))];

let bad = 0;
for (const id of jsIds) {
  const found = htmlIds.includes(id);
  if (!found) bad++;
  console.log((found ? 'OK   ' : 'MISS ') + id);
}
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const s of scripts) {
  const found = fs.existsSync(path.join(pub, s));
  if (!found) bad++;
  console.log((found ? 'OK   file ' : 'MISS file ') + s);
}
// Required M1 controls must be real buttons in the DOM.
for (const id of ['connectBtn', 'startAttemptBtn', 'finishAttemptBtn', 'retryBtn', 'newPromptBtn']) {  const re = new RegExp('<button[^>]*id="' + id + '"[^>]*>', 'i');
  const found = re.test(html);
  if (!found) bad++;
  console.log((found ? 'OK   button ' : 'MISS button ') + id);
}
// Labels the user asked for must be rendered.
for (const label of ['Speech Coach', 'attemptState', 'AI Coach', 'Rules Coach']) {
  const found = label === 'AI Coach' || label === 'Rules Coach'
    ? js.includes(label)
    : html.includes(label);
  if (!found) bad++;
  console.log((found ? 'OK   label ' : 'MISS label ') + label + (label === 'AI Coach' || label === 'Rules Coach' ? ' (in script.js badge)' : ' (in index.html)'));
}
// Coach Engine selector: exactly two radios, AI checked by default.
{
  const radios = [...html.matchAll(/<input[^>]*name="coachEngine"[^>]*>/g)].map((m) => m[0]);
  const values = radios.map((r) => (r.match(/value="([^"]+)"/) || [])[1]).sort();
  const twoOptions = radios.length === 2 && values[0] === 'ai' && values[1] === 'rules';
  if (!twoOptions) bad++;
  console.log((twoOptions ? 'OK   engine ' : 'MISS engine ') + 'two radios [ai, rules], found [' + values.join(', ') + ']');
  const aiDefault = /<input[^>]*name="coachEngine"[^>]*value="ai"[^>]*checked[^>]*>|<input[^>]*checked[^>]*name="coachEngine"[^>]*value="ai"[^>]*>/.test(html);
  if (!aiDefault) bad++;
  console.log((aiDefault ? 'OK   engine ' : 'MISS engine ') + 'AI Coach checked by default');
  const noKeyFields = !/api[_-]?key/i.test(html);
  if (!noKeyFields) bad++;
  console.log((noKeyFields ? 'OK   engine ' : 'MISS engine ') + 'no API-key fields in browser HTML');
}
console.log(bad === 0 ? 'DOM-CROSSCHECK-PASS' : 'DOM-CROSSCHECK-FAIL');
process.exit(bad ? 1 : 0);
