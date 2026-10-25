const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { resolveDeployment } = require("../deployments");
const { ui } = require("../ui");

async function destroy(deploymentRef, options) {
  const config = resolveConfig(options);
  const client = createClient(config);
  const deployment = await resolveDeployment(client, config.project, deploymentRef);

  ui.step(`Removing ${deployment.branchName}`);
  await client.remove(deployment._id);
  ui.ok(`${deployment.branchName} removed`);
}

module.exports = destroy;
