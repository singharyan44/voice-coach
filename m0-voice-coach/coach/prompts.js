// Practice prompt library for M1 Speech Coach (+ Day 2 adaptation).
//
// Each prompt carries `skills`: the skill keys (see coach/profile.js SKILLS)
// it trains. The assigner uses these tags to target the user's weakest skill.
// General prompts carry several tags; drill prompts carry one and include a
// concrete constraint in the objective.

const PROMPTS = [
  {
    id: 'intro-30',
    title: 'Introduce yourself in 30 seconds',
    objective: 'Say your name, what you do, and one thing you care about. Aim for 3–4 clear sentences.',
    skills: ['structure', 'substance', 'pace'],
  },
  {
    id: 'weekend',
    title: 'Describe your weekend',
    objective: 'Explain what you did last weekend in 3–4 sentences, in order from start to finish.',
    skills: ['structure', 'substance'],
  },
  {
    id: 'recommend',
    title: 'Recommend something you like',
    objective: 'Pick a movie, book, food, or place. Say what it is, why you like it, and who should try it.',
    skills: ['structure', 'substance', 'fillers'],
  },
  {
    id: 'explain-job',
    title: 'Explain what you do',
    objective: 'Describe your work or studies so a stranger would understand it. Avoid jargon.',
    skills: ['structure', 'substance', 'pace'],
  },
  {
    id: 'opinion',
    title: 'Give an opinion',
    objective: 'State one opinion you hold, give one reason for it, and one example that supports it.',
    skills: ['structure', 'substance', 'fillers'],
  },
  {
    id: 'story',
    title: 'Tell a short story',
    objective: 'Tell a true story from your life with a beginning, one turning point, and an ending.',
    skills: ['structure', 'substance', 'pace'],
  },
  {
    id: 'drill-no-fillers',
    title: 'Drill: zero fillers',
    objective: 'Explain what you had for your last meal. Rule: not a single um, uh, like, or you-know — pause in silence instead.',
    skills: ['fillers'],
  },
  {
    id: 'drill-slow-down',
    title: 'Drill: slow and deliberate',
    objective: 'Describe your morning routine as if teaching it to someone half-asleep. Land every sentence ending before starting the next.',
    skills: ['pace'],
  },
  {
    id: 'drill-speed-up',
    title: 'Drill: 45-second pitch',
    objective: 'Pitch your favorite hobby in under 45 seconds with energy. No trailing off — keep a steady forward pace.',
    skills: ['pace', 'substance'],
  },
  {
    id: 'drill-no-restarts',
    title: 'Drill: no restarts',
    objective: 'Describe the room you are in. Rule: never say a word twice — push through stumbles without going back.',
    skills: ['repeats'],
  },
  {
    id: 'drill-conclusion-first',
    title: 'Drill: conclusion first',
    objective: 'Pick any opinion. State your conclusion in the very first sentence, then give exactly two supporting points. Stop.',
    skills: ['structure'],
  },
  {
    id: 'drill-full-story',
    title: 'Drill: the whole story',
    objective: 'Tell one complete story with a beginning, middle, and end. Short answers are not allowed — keep going until it resolves.',
    skills: ['substance'],
  },
];

function getPrompt(id) {
  return PROMPTS.find((p) => p.id === id) || null;
}

function pickPrompt(excludeId) {
  const pool = excludeId ? PROMPTS.filter((p) => p.id !== excludeId) : PROMPTS;
  const list = pool.length > 0 ? pool : PROMPTS;
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = { PROMPTS, getPrompt, pickPrompt };
