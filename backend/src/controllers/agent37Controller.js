const config = require("../services/agent37ConfigService");
const agent37 = require("../services/agent37Service");

function status(request, response) {
  response.json(config.publicConfiguration());
}

async function configure(request, response) {
  const candidate = config.validateConfiguration(request.body || {});
  await agent37.verifyCandidate(candidate);
  response.status(201).json(await config.saveConfiguration(candidate));
}

module.exports = { status, configure };
