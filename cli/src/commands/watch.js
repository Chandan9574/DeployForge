const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { isRepository, discoverBranches, normalizeRemoteUrl, remoteUrl } = require("../git");
const { isActiveAtCommit, isInProgress, listActive } = require("../deployments");
const { loadState, saveState } = require("../state");
const { ui, formatDuration } = require("../ui");
const { waitForDeployment } = require("./deploy");

function deploymentInput(config, branch) {
  const input = {
    projectName: config.project,
    branchName: branch.name,
    commitSha: branch.sha,
    healthcheckPath: config.healthPath
  };

  if (config.deploymentMode === "image") {
    return { ...input, deploymentMode: "image", image: config.image };
  }

  return {
    ...input,
    repositoryUrl: config.repoUrl,
    deploymentMode: "dockerfile",
    dockerfilePath: config.dockerfilePath,
    buildContext: config.buildContext
  };
}

async function watch(options = {}) {
  const config = resolveConfig(options);
  if (!(await isRepository(config.repo))) {
    throw new Error(`${config.repo} is not a Git repository`);
  }

  if (config.deploymentMode === "dockerfile") {
    config.repoUrl = normalizeRemoteUrl(config.repoUrl || await remoteUrl(config.repo));
    if (!config.repoUrl) {
      throw new Error("No origin remote found. Use --repo-url or run deployforge init first.");
    }
  }

  const client = createClient(config);
  const state = await loadState(config.repo);
  if (state.project !== config.project || state.apiUrl !== config.apiUrl) {
    state.branches = {};
    state.project = config.project;
    state.apiUrl = config.apiUrl;
  }
  let running = true;
  let inFlight = false;
  const warnedLocal = new Set();

  const stop = () => {
    running = false;
    ui.info("Stopping watcher...");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  ui.title(`Watching ${config.repo}`);
  ui.step(`Project ${config.project}`);
  ui.step(`API ${config.apiUrl}`);
  ui.step(`Pattern ${config.pattern}${options.once ? "" : ` every ${config.intervalMs / 1000}s`}`);

  async function deployBranch(branch) {
    const deployments = await listActive(client, config.project);
    const existing = deployments.find((item) => item.branchName === branch.name);
    const known = state.branches[branch.name];

    if (existing) {
      if (isActiveAtCommit(existing, branch.sha)) {
        state.branches[branch.name] = {
          sha: branch.sha,
          deploymentId: existing._id,
          previewUrl: existing.previewUrl,
          status: existing.status
        };
        return;
      }
      if (isInProgress(existing)) return;
      ui.step(`Updating ${branch.name} to ${branch.sha.slice(0, 12)}`);
      await client.restart(existing._id, { commitSha: branch.sha });
      const finished = await waitForDeployment(client, existing._id, config.timeoutMs, { quiet: true });
      if (finished.status === "running") {
        ui.ok(`${branch.name} updated in ${formatDuration(finished.durationMs)}`);
        ui.url(finished.previewUrl);
      } else {
        ui.error(`${branch.name}: ${finished.errorMessage || finished.status}`);
      }
      state.branches[branch.name] = {
        sha: branch.sha,
        deploymentId: existing._id,
        previewUrl: finished.previewUrl,
        status: finished.status
      };
      return;
    }

    if (known && known.sha === branch.sha && known.status === "failed") return;

    ui.step(`Deploying ${branch.name} at ${branch.sha.slice(0, 12)}`);
    try {
      const deployment = await client.create(deploymentInput(config, branch));
      const finished = await waitForDeployment(client, deployment._id, config.timeoutMs, { quiet: true });
      if (finished.status === "running") {
        ui.ok(`${branch.name} ready in ${formatDuration(finished.durationMs)}`);
        ui.url(finished.previewUrl);
      } else {
        ui.error(`${branch.name}: ${finished.errorMessage || finished.status}`);
      }
      state.branches[branch.name] = {
        sha: branch.sha,
        deploymentId: deployment._id,
        previewUrl: finished.previewUrl,
        status: finished.status
      };
    } catch (error) {
      ui.error(`${branch.name}: ${error.message}`);
      state.branches[branch.name] = { sha: branch.sha, status: "failed", error: error.message };
    }
  }

  async function destroyBranch(name, deploymentId) {
    ui.step(`Removing preview for deleted branch ${name}`);
    try {
      if (deploymentId) await client.remove(deploymentId);
      ui.ok(`${name} removed`);
    } catch (error) {
      ui.error(`${name}: ${error.message}`);
    }
    delete state.branches[name];
  }

  async function scan() {
    if (!running || inFlight) return;
    inFlight = true;
    try {
      const branches = await discoverBranches(config.repo, config.pattern, config.preferRemote);
      const active = await listActive(client, config.project);
      const activeByName = new Map(active.map((deployment) => [deployment.branchName, deployment]));

      for (const branch of branches) {
        if (!running) break;
        if (config.preferRemote && branch.localOnly) {
          if (!warnedLocal.has(branch.name)) {
            ui.warn(`${branch.name} exists only locally; push it before it can be previewed`);
            warnedLocal.add(branch.name);
          }
          continue;
        }
        try {
          await deployBranch(branch);
        } catch (error) {
          ui.error(`${branch.name}: ${error.message}`);
        }
      }

      const wanted = new Set(branches.map((branch) => branch.name));
      for (const deployment of active) {
        if (wanted.has(deployment.branchName)) continue;
        if (!state.branches[deployment.branchName]) continue;
        if (!running) break;
        await destroyBranch(deployment.branchName, deployment._id);
      }

      for (const name of Object.keys(state.branches)) {
        if (!wanted.has(name) && !activeByName.has(name)) delete state.branches[name];
      }
      await saveState(config.repo, state);
    } catch (error) {
      ui.error(error.message);
    } finally {
      inFlight = false;
    }
  }

  do {
    await scan();
    if (options.once || !running) break;
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  } while (running);

  if (options.destroyOnExit) {
    const active = await listActive(client, config.project).catch(() => []);
    for (const deployment of active) {
      if (state.branches[deployment.branchName]) {
        await destroyBranch(deployment.branchName, deployment._id);
      }
    }
    await saveState(config.repo, state);
  }
  ui.info("Watcher stopped");
}

module.exports = watch;
