const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const {
  currentBranch,
  discoverBranches,
  isRepository,
  normalizeRemoteUrl,
  remoteUrl,
  resolveBranchCommit
} = require("../git");
const { isActiveAtCommit, isInProgress, listActive } = require("../deployments");
const { ui, formatDuration } = require("../ui");

const FINAL = ["running", "failed", "stopped"];
const STATUS_LABELS = {
  pending: "Queued",
  cloning: "Cloning branch",
  building: "Building image",
  starting: "Starting container",
  checking: "Checking health",
  running: "Running"
};

function printNewLogs(deployment, cursor) {
  const logs = deployment.logs || [];
  for (let index = cursor; index < logs.length; index += 1) {
    ui.info(logs[index]);
  }
  return logs.length;
}

async function waitForDeployment(client, id, timeoutMs, { quiet = false } = {}) {
  const started = Date.now();
  let lastStatus = "";
  let cursor = 0;

  while (Date.now() - started < timeoutMs) {
    const deployment = await client.get(id);
    const changed = deployment.status !== lastStatus;
    lastStatus = deployment.status;
    if (!quiet) cursor = printNewLogs(deployment, cursor);
    if (changed && !quiet && STATUS_LABELS[deployment.status]) {
      ui.step(STATUS_LABELS[deployment.status]);
    }
    if (FINAL.includes(deployment.status)) return deployment;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  throw new Error(
    `Deployment is still running after ${Math.round(timeoutMs / 1000)} seconds. ` +
    `Follow its progress with: deployforge logs ${id} --follow`
  );
}

function deploymentInput(config, { branch, commitSha, repoUrl }) {
  const input = {
    projectName: config.project,
    branchName: branch,
    commitSha: commitSha || "",
    healthcheckPath: config.healthPath
  };

  if (config.deploymentMode === "image") {
    return { ...input, deploymentMode: "image", image: config.image };
  }

  return {
    ...input,
    repositoryUrl: repoUrl,
    deploymentMode: "dockerfile",
    dockerfilePath: config.dockerfilePath,
    buildContext: config.buildContext
  };
}

async function deployTarget(client, config, target, repoUrl, options) {
  const existing = (await listActive(client, config.project))
    .find((deployment) => deployment.branchName === target.name);

  if (!options.json) {
    ui.title(`DeployForge: ${target.name}`);
    ui.step(`Project ${config.project}`);
    ui.step(`Commit ${target.commitSha ? target.commitSha.slice(0, 12) : "branch HEAD"}`);
  }

  let deployment;

  if (existing) {
    if (isActiveAtCommit(existing, target.commitSha) && existing.status === "running") {
      if (!options.json) {
        ui.ok("This commit is already running");
        ui.url(existing.previewUrl);
      }
      return existing;
    }
    if (isInProgress(existing) && (!target.commitSha || isActiveAtCommit(existing, target.commitSha))) {
      if (!options.json) ui.step("Deployment already in progress; waiting for it");
      deployment = existing;
    } else if (isInProgress(existing)) {
      throw new Error(`${target.name} is already deploying a different commit`);
    } else {
      if (!options.json) ui.step(`Updating existing preview ${existing._id}`);
      deployment = await client.restart(existing._id, { commitSha: target.commitSha || "" });
    }
  } else {
    deployment = await client.create(deploymentInput(config, {
      branch: target.name,
      commitSha: target.commitSha,
      repoUrl
    }));
  }

  if (options.wait === false) {
    if (!options.json) {
      ui.ok(`${target.name} queued as ${deployment._id}`);
      ui.info(`Follow it with: deployforge logs ${deployment._id} --follow`);
    }
    return deployment;
  }

  const finished = await waitForDeployment(client, deployment._id, config.timeoutMs, { quiet: options.json });

  if (finished.status !== "running") {
    if (!options.json) {
      const { logs } = await client.logs(finished._id).catch(() => ({ logs: [] }));
      logs.slice(-10).forEach((line) => ui.info(line));
    }
    throw new Error(`${target.name}: ${finished.errorMessage || `deployment ended with status ${finished.status}`}`);
  }

  if (!options.json) {
    ui.ok(`${target.name} ready in ${formatDuration(finished.durationMs)}`);
    ui.url(finished.previewUrl);
  }
  return finished;
}

async function deploy(branches, options = {}) {
  const config = resolveConfig(options);
  const repository = await isRepository(config.repo);

  if (!repository && config.deploymentMode === "dockerfile") {
    throw new Error(`${config.repo} is not a Git repository`);
  }

  const repoUrl = normalizeRemoteUrl(
    config.repoUrl || (repository ? await remoteUrl(config.repo) : "")
  );
  if (config.deploymentMode === "dockerfile" && !repoUrl) {
    throw new Error("No origin remote found. Use --repo-url or run deployforge init first.");
  }

  let targets;
  if (options.all) {
    if (!repository) throw new Error(`${config.repo} is not a Git repository`);
    const discovered = await discoverBranches(config.repo, config.pattern, config.preferRemote);
    targets = discovered
      .filter((branch) => !(config.preferRemote && branch.localOnly))
      .map((branch) => ({ name: branch.name, commitSha: branch.sha }));

    const skipped = discovered.filter((branch) => config.preferRemote && branch.localOnly);
    if (skipped.length && !options.json) {
      skipped.forEach((branch) => ui.warn(`${branch.name} exists only locally; push it before it can be previewed`));
    }
  } else {
    const names = (Array.isArray(branches) ? branches : [branches]).filter(Boolean);
    if (names.length === 0) {
      if (!repository) throw new Error("Provide a branch name when deploying outside a Git repository");
      const branch = await currentBranch(config.repo);
      if (!branch) throw new Error("Could not determine the current Git branch");
      names.push(branch);
    }
    targets = names.map((name) => ({ name, commitSha: options.commit || "" }));
  }

  if (targets.length === 0) {
    if (!options.json) ui.info("No branches matched the deployment pattern");
    return [];
  }

  const client = createClient(config);
  const results = [];
  const failures = [];

  for (const target of targets) {
    try {
      if (!target.commitSha && repository) {
        target.commitSha = await resolveBranchCommit(config.repo, target.name, config.preferRemote);
      }
      results.push(await deployTarget(client, config, target, repoUrl, options));
    } catch (error) {
      const message = /Branch .* was not found/.test(error.message)
        ? `Branch "${target.name}" was not found locally or on origin`
        : error.message;
      failures.push({ branch: target.name, message });
      if (!options.json) ui.error(message);
      if (targets.length === 1) throw new Error(message);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  }

  if (failures.length) {
    const names = failures.map((failure) => failure.branch).join(", ");
    throw new Error(`Deployment failed for ${names}`);
  }

  return results;
}

module.exports = deploy;
module.exports.waitForDeployment = waitForDeployment;
