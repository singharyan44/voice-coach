// Practice prompts for M1 Speech Coach.
// Each prompt is a simple speaking objective. Kept small on purpose:
// M1 is about the loop, not a prompt library.
const PROMPTS = [
  {
    id: 'intro-30',
    title: 'Introduce yourself in 30 seconds',
    objective: 'Say your name, what you do, and one thing you care about. Aim for 3–4 clear sentences.',
  },
  {
    id: 'weekend',
    title: 'Describe your weekend',
    objective: 'Explain what you did last weekend in 3–4 sentences, in order from start to finish.',
  },
  {
    id: 'recommend',
    title: 'Recommend something you like',
    objective: 'Pick a movie, book, food, or place. Say what it is, why you like it, and who should try it.',
  },
  {
    id: 'explain-job',
    title: 'Explain what you do',
    objective: 'Describe your work or studies so a stranger would understand it. Avoid jargon.',
  },
  {
    id: 'opinion',
    title: 'Give an opinion',
    objective: 'State one opinion you hold, give one reason for it, and one example that supports it.',
  },
  {
    id: 'story',
    title: 'Tell a short story',
    objective: 'Tell a true story from your life with a beginning, one turning point, and an ending.',
  },
];

function pickPrompt(excludeId) {
  const pool = excludeId ? PROMPTS.filter((p) => p.id !== excludeId) : PROMPTS;
  const list = pool.length > 0 ? pool : PROMPTS;
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = { PROMPTS, pickPrompt };
