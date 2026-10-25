const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { currentBranch, isRepository } = require("../git");
const { listActive, resolveDeployments } = require("../deployments");
const { ui } = require("../ui");

async function stop(deployments, options = {}) {
  const config = resolveConfig(options);
  const client = createClient(config);
  let targets;

  if (options.all) {
    targets = await listActive(client, config.project);
    if (targets.length === 0) {
      if (options.json) console.log("[]");
      else ui.info("No active deployments to stop");
      return [];
    }
  } else {
    const refs = (Array.isArray(deployments) ? deployments : [deployments]).filter(Boolean);
    if (refs.length === 0 && await isRepository(config.repo)) {
      const branch = await currentBranch(config.repo);
      if (branch) refs.push(branch);
    }
    if (refs.length === 0) throw new Error("Provide a branch name, deployment id, or --all");
    targets = await resolveDeployments(client, config.project, refs);
  }

  const stopped = [];
  for (const deployment of targets) {
    await client.stop(deployment._id);
    stopped.push(deployment);
    if (options.json) continue;
    ui.ok(`${deployment.branchName} stopped`);
  }

  if (options.json) console.log(JSON.stringify(stopped.length === 1 ? stopped[0] : stopped, null, 2));
  return stopped;
}

module.exports = stop;
