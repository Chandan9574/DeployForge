const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { resolveDeployment } = require("../deployments");
const { ui } = require("../ui");

async function logs(deploymentRef, options) {
  const config = resolveConfig(options);
  const client = createClient(config);
  const deployment = await resolveDeployment(client, config.project, deploymentRef);

  if (!options.follow) {
    const { logs: lines } = await client.logs(deployment._id);
    lines.forEach((line) => console.log(line));
    return;
  }

  let seen = 0;
  let running = true;
  process.once("SIGINT", () => {
    running = false;
  });

  ui.info(`Following logs for ${deployment.branchName} (Ctrl-C to stop)`);
  while (running) {
    const { logs: lines } = await client.logs(deployment._id);
    for (let index = seen; index < lines.length; index += 1) console.log(lines[index]);
    seen = lines.length;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

module.exports = logs;
