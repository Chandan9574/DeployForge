const { spawn } = require("child_process");
const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { resolveDeployment } = require("../deployments");
const { ui } = require("../ui");

function browserCommand() {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "cmd";
  return "xdg-open";
}

async function open(deploymentRef, options) {
  const config = resolveConfig(options);
  const client = createClient(config);
  const deployment = await resolveDeployment(client, config.project, deploymentRef);

  ui.url(deployment.previewUrl);
  if (options.browser) {
    const command = browserCommand();
    const args = process.platform === "win32" ? ["/c", "start", "", deployment.previewUrl] : [deployment.previewUrl];
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  }
}

module.exports = open;
