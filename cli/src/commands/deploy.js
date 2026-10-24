const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { isRepository, remoteUrl, normalizeRemoteUrl, resolveBranchCommit } = require("../git");
const { listActive } = require("../deployments");
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

async function deploy(branch, options) {
  const config = resolveConfig(options);
  if (!(await isRepository(config.repo))) {
    throw new Error(`${config.repo} is not a Git repository`);
  }

  const repoUrl = options.repoUrl || normalizeRemoteUrl(await remoteUrl(config.repo));
  if (!repoUrl) {
    throw new Error("No origin remote found. Use --repo-url to provide an HTTPS repository URL.");
  }

  const commitSha = await resolveBranchCommit(config.repo, branch, config.preferRemote);
  const client = createClient(config);
  const existing = (await listActive(client, config.project)).find((item) => item.branchName === branch);

  ui.title(`DeployForge: ${branch}`);
  ui.step(`Project ${config.project}`);
  ui.step(`Commit ${commitSha.slice(0, 12)}`);

  let deployment;
  if (existing) {
    if (existing.commitSha === commitSha && existing.status === "running") {
      ui.ok("This commit is already running");
      ui.url(existing.previewUrl);
      return existing;
    }
    if (existing.commitSha === commitSha) {
      ui.step("Deployment already in progress; waiting for it");
      deployment = existing;
    } else {
      ui.step(`Updating existing preview ${existing._id}`);
      deployment = await client.restart(existing._id, { commitSha });
    }
  } else {
    deployment = await client.create({
      projectName: config.project,
      repositoryUrl: repoUrl,
      branchName: branch,
      commitSha,
      deploymentMode: "dockerfile",
      healthcheckPath: options.healthPath || "/"
    });
  }

  const finished = await waitForDeployment(client, deployment._id, config.timeoutMs);
  if (finished.status !== "running") {
    throw new Error(finished.errorMessage || `Deployment ended with status ${finished.status}`);
  }

  ui.ok(`Ready in ${formatDuration(finished.durationMs)}`);
  ui.url(finished.previewUrl);
  return finished;
}

module.exports = deploy;
module.exports.waitForDeployment = waitForDeployment;
