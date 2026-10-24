const AppError = require("../errors/AppError");
const env = require("../config/env");
const slugify = require("../utils/slugify");
const { reservePort } = require("./portManager");
const { createPreview, removePreview, isPreviewRunning, getStats, getLogs } = require("./dockerService");
const agent37 = require("./agent37Service");
const { configurePreview, removePreview: removeProxy } = require("./nginxService");
const { Deployment, findActive, findById, list, listActive, countActiveByProject } = require("../repositories/deploymentRepository");

function previewUrl(branchName) {
  return `http://${slugify(branchName)}.${env.PREVIEW_DOMAIN}`;
}

function publicDeployment(deployment) {
  const value = deployment.toObject ? deployment.toObject() : deployment;
  return { ...value, logs: undefined, errorMessage: value.errorMessage || "" };
}

function useAgent37() {
  return env.DEPLOYMENT_RUNTIME === "agent37";
}

async function createDeployment(input) {
  if (useAgent37() && !input.repositoryUrl) {
    throw new AppError("A repository URL is required for Agent37 deployments", 400, "REPOSITORY_REQUIRED");
  }
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
    runtime: useAgent37() ? "agent37" : "local-docker",
    containerName: `preview-${branchSlug}-${Date.now()}`,
    hostPort,
    previewUrl: previewUrl(input.branchName),
    status: "building"
  });

  try {
    if (useAgent37()) {
      const instance = await agent37.createInstance();
      const instanceId = agent37.instanceId(instance);
      if (!instanceId) throw new Error("Agent37 did not return an instance ID");
      deployment.agent37InstanceId = instanceId;
      deployment.agent37Status = "created";
      deployment.agent37Url = `https://${instanceId}.${env.AGENT37_INSTANCE_DOMAIN}`;
      deployment.status = "starting";
      deployment.logs.push(`Agent37 instance created: ${instanceId}`);
      await deployment.save();

      await agent37.prepareRepository(instanceId, input.repositoryUrl, input.branchName);
      await agent37.startApplication(instanceId, env.AGENT37_APP_PORT, env.AGENT37_HEALTH_PATH);
      const publicPort = await agent37.createPublicPort(
        instanceId,
        env.AGENT37_APP_PORT,
        slugify(`preview-${branchSlug}`).slice(0, 30),
        `DeployForge ${input.projectName}/${input.branchName}`.slice(0, 64)
      );
      if (!publicPort.url) throw new Error("Agent37 did not return a public port URL");
      deployment.agent37PublicPort = env.AGENT37_APP_PORT;
      deployment.agent37PublicUrl = publicPort.url;
      deployment.previewUrl = publicPort.url;
      deployment.agent37Status = "ready";
      deployment.status = "running";
      deployment.logs.push(`Repository cloned and application started on port ${env.AGENT37_APP_PORT}`);
      deployment.logs.push(`Public preview created: ${publicPort.url}`);
      await deployment.save();
      return publicDeployment(deployment);
    }

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
    if (deployment.agent37InstanceId) await agent37.deleteInstance(deployment.agent37InstanceId).catch(() => {});
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
    if (deployment.runtime === "agent37") {
      if (!deployment.agent37InstanceId) {
        deployment.status = "failed";
        deployment.errorMessage = "Agent37 deployment has no instance assigned.";
        deployment.logs.push("Deployment marked failed because no Agent37 instance was assigned");
        await deployment.save();
        return;
      }
      const instance = await agent37.getInstance(deployment.agent37InstanceId);
      const instanceStatus = instance.status || instance.state || "unknown";
      deployment.agent37Status = instanceStatus;
      if (["stopped", "deleted", "failed", "error"].includes(String(instanceStatus).toLowerCase())) {
        deployment.status = "stopped";
        deployment.errorMessage = "The Agent37 instance is no longer available.";
        deployment.logs.push("Deployment stopped because its Agent37 instance is unavailable");
      }
      await deployment.save();
      return;
    }
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
  if (deployment.runtime === "agent37" && deployment.agent37InstanceId && ["pending", "building", "starting", "running"].includes(deployment.status)) {
    const instance = await agent37.getInstance(deployment.agent37InstanceId);
    deployment.agent37Status = instance.status || instance.state || "unknown";
    await deployment.save();
  } else if (["pending", "building", "starting", "running"].includes(deployment.status) && deployment.containerId) {
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
  if (deployment.runtime !== "agent37" && ["pending", "building", "starting", "running"].includes(deployment.status) && !deployment.containerId) {
    deployment.status = "failed";
    deployment.errorMessage = "Preview has no container assigned.";
    deployment.logs.push("Preview marked failed because no container was assigned");
    await deployment.save();
  }
  return deployment;
}

async function getDeploymentStats(id) {
  const deployment = await getDeployment(id);
  if (deployment.runtime === "agent37") return { cpuPercent: 0, memoryUsage: 0, memoryLimit: 0 };
  return deployment.containerId ? getStats(deployment.containerId) : { cpuPercent: 0, memoryUsage: 0, memoryLimit: 0 };
}

async function getDeploymentLogs(id) {
  const deployment = await getDeployment(id);
  if (deployment.runtime === "agent37") return { logs: deployment.logs };
  const logs = deployment.containerId ? await getLogs(deployment.containerId) : deployment.logs;
  return { logs };
}

async function stopDeployment(id) {
  const deployment = await getDeployment(id);
  if (deployment.containerId) await removePreview(deployment.containerId);
  if (deployment.agent37InstanceId && deployment.agent37PublicPort) {
    try {
      await agent37.deletePublicPort(deployment.agent37InstanceId, deployment.agent37PublicPort);
    } catch (error) {
      if (error.statusCode !== 404) throw error;
    }
  }
  if (deployment.agent37InstanceId) {
    try {
      await agent37.deleteInstance(deployment.agent37InstanceId);
    } catch (error) {
      if (error.statusCode !== 404) throw error;
    }
  }
  await removeProxy(deployment.branchName);
  deployment.status = "stopped";
  deployment.agent37Status = "deleted";
  deployment.errorMessage = "";
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
