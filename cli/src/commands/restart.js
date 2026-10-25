const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { currentBranch, isRepository } = require("../git");
const { listActive, resolveDeployments } = require("../deployments");
const { ui, formatDuration } = require("../ui");
const { waitForDeployment } = require("./deploy");

async function restart(deployments, options = {}) {
  const config = resolveConfig(options);
  const client = createClient(config);
  let targets;

  if (options.all) {
    targets = await listActive(client, config.project);
    if (targets.length === 0) {
      ui.info("No active deployments to restart");
      return [];
    }
    if (options.commit) throw new Error("--commit can only be used with a single deployment");
  } else {
    const refs = (Array.isArray(deployments) ? deployments : [deployments]).filter(Boolean);
    if (refs.length === 0 && await isRepository(config.repo)) {
      const branch = await currentBranch(config.repo);
      if (branch) refs.push(branch);
    }
    if (refs.length === 0) throw new Error("Provide a branch name, deployment id, or --all");
    if (options.commit && refs.length > 1) throw new Error("--commit can only be used with a single deployment");
    targets = await resolveDeployments(client, config.project, refs);
  }

  const results = [];
  const failures = [];

  for (const deployment of targets) {
    try {
      if (!options.json) ui.step(`Restarting ${deployment.branchName}`);
      const queued = await client.restart(deployment._id, { commitSha: options.commit || "" });
      const finished = options.wait === false
        ? queued
        : await waitForDeployment(client, deployment._id, config.timeoutMs, { quiet: options.json });

      if (finished.status === "failed" || finished.status === "stopped") {
        throw new Error(finished.errorMessage || `deployment ended with status ${finished.status}`);
      }

      results.push(finished);
      if (!options.json) {
        if (finished.status === "running") {
          ui.ok(`${deployment.branchName} restarted in ${formatDuration(finished.durationMs)}`);
          ui.url(finished.previewUrl);
        } else {
          ui.ok(`${deployment.branchName} queued as ${deployment._id}`);
        }
      }
    } catch (error) {
      failures.push({ branch: deployment.branchName, message: error.message });
      if (!options.json) ui.error(`${deployment.branchName}: ${error.message}`);
      if (targets.length === 1) throw error;
    }
  }

  if (options.json) console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));

  if (failures.length) {
    throw new Error(`Restart failed for ${failures.map((failure) => failure.branch).join(", ")}`);
  }
  return results;
}

module.exports = restart;
