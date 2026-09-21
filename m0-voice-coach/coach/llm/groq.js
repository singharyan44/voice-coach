// Groq provider: plain OpenAI-compatible chat completions.
const { completeJSON } = require('./chat');

function complete(args) {
  return completeJSON(args);
}

module.exports = { complete };
