const AppError = require("../errors/AppError");
const env = require("../config/env");
const slugify = require("../utils/slugify");
const { reservePort } = require("./portManager");
const { createPreview, removePreview, isPreviewRunning, getStats, getLogs } = require("./dockerService");
const { configurePreview, removePreview: removeProxy } = require("./nginxService");
const { Deployment, findActive, findById, list, listActive, countActiveByProject } = require("../repositories/deploymentRepository");

function previewUrl(branchName) {
  return `http://${slugify(branchName)}.${env.PREVIEW_DOMAIN}`;
}

function publicDeployment(deployment) {
  const value = deployment.toObject ? deployment.toObject() : deployment;
  return { ...value, logs: undefined, errorMessage: value.errorMessage || "" };
}

async function createDeployment(input) {
  const existing = await findActive(input.projectName, input.branchName);
  if (existing) throw new AppError("This branch already has a preview", 409, "DUPLICATE_PREVIEW");
  const activeCount = await countActiveByProject(input.projectName);
  if (activeCount >= env.MAX_ACTIVE_DEPLOYMENTS_PER_PROJECT) {
    throw new AppError(
      `This project already has ${env.MAX_ACTIVE_DEPLOYMENTS_PER_PROJECT} active previews`,
      429,
      "PREVIEW_LIMIT_REACHED"
    );
  }

  const hostPort = await reservePort(env.PREVIEW_PORT_START, env.PREVIEW_PORT_END);
  const branchSlug = slugify(input.branchName);
  const deployment = await Deployment.create({
    ...input,
    containerName: `preview-${branchSlug}-${Date.now()}`,
    hostPort,
    previewUrl: previewUrl(input.branchName),
    status: "building"
  });

  try {
    const container = await createPreview({
      image: input.image,
      name: deployment.containerName,
      hostPort,
      containerPort: input.containerPort,
      labels: {
        "deployforge.branch": input.branchName,
        "deployforge.project": input.projectName
      }
    });
    deployment.containerId = container.id;
    deployment.status = "starting";
    deployment.logs.push("Container started");
    await deployment.save();

    await configurePreview({
      branchName: input.branchName,
      previewUrl: deployment.previewUrl,
      hostPort
    });
    deployment.status = "running";
    deployment.logs.push("Preview is ready");
    await deployment.save();
    return publicDeployment(deployment);
  } catch (error) {
    if (deployment.containerId) await removePreview(deployment.containerId).catch(() => {});
    await removeProxy(input.branchName).catch(() => {});
    deployment.status = "failed";
    deployment.errorMessage = error.message.slice(0, 1000);
    deployment.logs.push(`Deployment failed: ${deployment.errorMessage}`);
    await deployment.save();
    throw new AppError("Preview deployment failed", 500, "DEPLOYMENT_FAILED");
  }
}

async function getDeployments() {
  await reconcileDeployments();
  return list();
}

async function reconcileDeployments() {
  const activeDeployments = await listActive();
  await Promise.all(activeDeployments.map(async (deployment) => {
    if (!deployment.containerId) {
      deployment.status = "failed";
      deployment.errorMessage = "Preview has no container assigned.";
      deployment.logs.push("Preview marked failed because no container was assigned");
      await deployment.save();
      return;
    }
    const running = await isPreviewRunning(deployment.containerId);
    if (running) return;

    await removePreview(deployment.containerId);
    await removeProxy(deployment.branchName);
    deployment.status = "stopped";
    deployment.errorMessage = "The preview container is no longer running.";
    deployment.logs.push("Preview stopped because its container is no longer running");
    await deployment.save();
  }));
}

async function getDeployment(id) {
  const deployment = await findById(id);
  if (!deployment) throw new AppError("Deployment not found", 404, "DEPLOYMENT_NOT_FOUND");
  if (["pending", "building", "starting", "running"].includes(deployment.status) && deployment.containerId) {
    const running = await isPreviewRunning(deployment.containerId);
    if (!running) {
      await removePreview(deployment.containerId);
      await removeProxy(deployment.branchName);
      deployment.status = "stopped";
      deployment.errorMessage = "The preview container is no longer running.";
      deployment.logs.push("Preview stopped because its container is no longer running");
      await deployment.save();
    }
  }
  if (["pending", "building", "starting", "running"].includes(deployment.status) && !deployment.containerId) {
    deployment.status = "failed";
    deployment.errorMessage = "Preview has no container assigned.";
    deployment.logs.push("Preview marked failed because no container was assigned");
    await deployment.save();
  }
  return deployment;
}

async function getDeploymentStats(id) {
  const deployment = await getDeployment(id);
  return deployment.containerId ? getStats(deployment.containerId) : { cpuPercent: 0, memoryUsage: 0, memoryLimit: 0 };
}

async function getDeploymentLogs(id) {
  const deployment = await getDeployment(id);
  const logs = deployment.containerId ? await getLogs(deployment.containerId) : deployment.logs;
  return { logs };
}

async function stopDeployment(id) {
  const deployment = await getDeployment(id);
  if (deployment.containerId) await removePreview(deployment.containerId);
  await removeProxy(deployment.branchName);
  deployment.status = "stopped";
  deployment.logs.push("Preview removed");
  await deployment.save();
  return publicDeployment(deployment);
}

module.exports = {
  createDeployment,
  getDeployments,
  getDeployment,
  getDeploymentStats,
  getDeploymentLogs,
  stopDeployment,
  reconcileDeployments
};
