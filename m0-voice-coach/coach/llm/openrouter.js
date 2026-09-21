// OpenRouter provider: OpenAI-compatible + recommended routing headers.
const { completeJSON } = require('./chat');

function complete(args) {
  return completeJSON({
    ...args,
    extraHeaders: {
      'HTTP-Referer': 'https://localhost:3000/',
      'X-Title': 'Voice Coach M1',
    },
  });
}

module.exports = { complete };
