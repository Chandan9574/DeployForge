const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { currentBranch, isRepository } = require("../git");
const { resolveDeployment } = require("../deployments");
const { ui } = require("../ui");

async function status(deployment, options = {}) {
  const config = resolveConfig(options);
  let reference = deployment;
  if (!reference && await isRepository(config.repo)) {
    reference = await currentBranch(config.repo);
  }
  if (!reference) throw new Error("Provide a branch name or deployment id");

  const client = createClient(config);
  const current = await resolveDeployment(client, config.project, reference);
  const stats = current.status === "running"
    ? await client.stats(current._id).catch(() => null)
    : null;
  const result = stats ? { ...current, stats } : current;

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  ui.title(`${current.branchName} (${current.status})`);
  ui.step(`Project    ${current.projectName}`);
  ui.step(`Deployment ${current._id}`);
  ui.step(`Container  ${current.containerId || "-"}`);
  ui.step(`Host port  ${current.hostPort || "-"}`);
  ui.step(`Commit     ${current.commitSha || "-"}`);
  if (stats) {
    ui.step(`CPU        ${stats.cpuPercent}%`);
    ui.step(`Memory     ${Math.round(stats.memoryUsage / 1024 / 1024)} MB`);
  }
  if (current.errorMessage) ui.error(current.errorMessage);
  if (current.previewUrl) ui.url(current.previewUrl);
  return result;
}

module.exports = status;
