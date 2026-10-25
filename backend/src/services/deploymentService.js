const crypto = require("crypto");
const AppError = require("../errors/AppError");
const env = require("../config/env");
const { reservePort } = require("./portManager");
const { cloneBranch, removeWorkspace } = require("./gitService");
const { buildImage, imageExposedPort, removeImage } = require("./buildService");
const { waitForHealthy } = require("./healthService");
const {
  createPreview,
  removePreview,
  isPreviewRunning,
  listManagedContainers,
  getStats,
  getLogs,
  ensureImage
} = require("./dockerService");
const { configurePreview, removePreview: removeProxy } = require("./nginxService");
const {
  findActive,
  findById,
  findInternal,
  markContainerStopped,
  markFailedWithoutContainer,
  findByRunToken,
  updateRun,
  list,
  listActive,
  countActiveByImage,
  countActiveByProject,
  createDeployment
} = require("../repositories/deploymentRepository");
const { previewUrl, previewSlug } = require("../utils/preview");
const { ACTIVE_STATUSES } = require("../constants");

const RUNNING_CONTAINER_STATUSES = ["running"];
const STATS_CONTAINER_STATUSES = ["starting", "checking", "running"];

const RUN_FIELDS = [
  "status", "startedAt", "readyAt", "durationMs", "errorMessage", "commitSha",
  "imageTag", "containerId", "containerPort", "repositoryUrl", "dockerfilePath",
  "buildContext", "healthcheckPath"
];

class PipelineCancelled extends Error {}

function addLog(deployment, message) {
  const line = String(message || "").trim();
  if (!line) return;
  deployment.logs.push(line.slice(0, 2000));
  if (deployment.logs.length > 500) {
    const overflow = deployment.logs.length - 500;
    deployment.logs = deployment.logs.slice(-500);
    if (deployment.$locals?.persistedLogs) {
      deployment.$locals.persistedLogs = Math.max(0, deployment.$locals.persistedLogs - overflow);
    }
  }
}

function publicDeployment(deployment) {
  const value = deployment.toObject ? deployment.toObject() : { ...deployment };
  delete value.runToken;
  if (env.NGINX_ENABLED !== "true" && value.hostPort) {
    value.previewUrl = previewUrl(value.projectName, value.branchName, value.hostPort);
  }
  return {
    ...value,
    logs: Array.isArray(value.logs) ? value.logs.slice(-100) : [],
    errorMessage: value.errorMessage || ""
  };
}

function safeErrorMessage(error) {
  const text = error?.message || "Deployment failed";
  return text.replace(/\/\/[^@\s]+@/g, "//").slice(0, 1000);
}

async function persistRun(deployment, runToken) {
  const update = { $set: {} };
  for (const field of RUN_FIELDS) {
    if (deployment[field] !== undefined) update.$set[field] = deployment[field];
  }
  const persisted = deployment.$locals.persistedLogs || 0;
  const newLogs = deployment.logs.slice(persisted);
  if (newLogs.length) {
    update.$push = { logs: { $each: newLogs, $slice: -500 } };
  }
  const saved = await updateRun(deployment._id, runToken, update);
  if (!saved) throw new PipelineCancelled();
  deployment.$locals.persistedLogs = deployment.logs.length;
  return saved;
}

function persistQueued(deployment, runToken) {
  const previous = deployment.$locals.saveQueue || Promise.resolve();
  const next = previous.catch(() => {}).then(() => persistRun(deployment, runToken));
  deployment.$locals.saveQueue = next;
  return next;
}

async function assertRun(deployment, runToken) {
  const current = await findByRunToken(deployment._id, runToken);
  if (!current || !ACTIVE_STATUSES.includes(current.status)) throw new PipelineCancelled();
}

function staleWithoutContainer(deployment) {
  const threshold = env.GIT_CLONE_TIMEOUT_MS + env.BUILD_TIMEOUT_MS + 60000;
  return Date.now() - new Date(deployment.updatedAt).getTime() > threshold;
}

async function createRecord(input) {
  const usedPorts = new Set();
  let lastError;

  for (let attempt = 0; attempt <= env.PREVIEW_PORT_END - env.PREVIEW_PORT_START; attempt += 1) {
    const hostPort = await reservePort(env.PREVIEW_PORT_START, env.PREVIEW_PORT_END, usedPorts);
    const preview = previewUrl(
      input.projectName,
      input.branchName,
      env.NGINX_ENABLED === "true" ? undefined : hostPort
    );
    try {
      return await createDeployment({
        ...input,
        containerName: `preview-${previewSlug(input.projectName, input.branchName)}-${Date.now()}`,
        hostPort,
        previewUrl: preview,
        runToken: crypto.randomUUID(),
        status: "pending",
        startedAt: new Date()
      });
    } catch (error) {
      lastError = error;
      if (error.code === 11000 && error.keyPattern?.hostPort) {
        usedPorts.add(hostPort);
        continue;
      }
      if (error.code === 11000 && error.keyPattern?.previewUrl) {
        throw new AppError("This branch maps to a preview hostname that is already active", 409, "PREVIEW_HOST_CONFLICT");
      }
      if (error.code === 11000) {
        throw new AppError("This branch already has an active preview", 409, "DUPLICATE_PREVIEW");
      }
      throw error;
    }
  }

  throw lastError || new AppError("No preview ports are available", 503, "NO_PORTS_AVAILABLE");
}

async function runPipeline(deployment, input, previous = {}, runToken = deployment.runToken) {
  deployment.$locals.persistedLogs = deployment.logs.length;
  let workspace = null;
  let newContainerId = "";
  let newImageTag = "";
  const startedAt = Date.now();
  const labels = {
    "deployforge.managed": "true",
    "deployforge.branch": input.branchName,
    "deployforge.project": input.projectName,
    "deployforge.deployment": String(deployment._id)
  };

  const onBuildLog = (line) => {
    addLog(deployment, line);
    if (deployment.logs.length % 10 === 0) {
      persistQueued(deployment, runToken).catch(() => {});
    }
  };

  try {
    deployment.status = "cloning";
    deployment.startedAt = deployment.startedAt || new Date();
    deployment.errorMessage = "";
    deployment.repositoryUrl = input.repositoryUrl || "";
    deployment.dockerfilePath = input.dockerfilePath;
    deployment.buildContext = input.buildContext;
    deployment.healthcheckPath = input.healthcheckPath;
    addLog(
      deployment,
      input.deploymentMode === "dockerfile"
        ? `Cloning ${input.repositoryUrl} (${input.branchName})`
        : `Preparing image ${input.image}`
    );
    await persistQueued(deployment, runToken);

    if (input.deploymentMode === "dockerfile") {
      const cloned = await cloneBranch({
        deploymentId: String(deployment._id),
        repositoryUrl: input.repositoryUrl,
        branchName: input.branchName,
        commitSha: input.commitSha
      });
      workspace = cloned.workspace;
      deployment.commitSha = cloned.commitSha;
      addLog(deployment, `Checked out ${cloned.commitSha.slice(0, 12)}`);

      deployment.status = "building";
      addLog(deployment, "Building Docker image");
      await persistQueued(deployment, runToken);
      await assertRun(deployment, runToken);

      newImageTag = await buildImage({
        workspace,
        buildContext: input.buildContext,
        dockerfilePath: input.dockerfilePath,
        projectName: input.projectName,
        branchName: input.branchName,
        commitSha: cloned.commitSha,
        onLog: onBuildLog
      });
      deployment.containerPort = input.containerPort || await imageExposedPort(newImageTag);
      addLog(deployment, `Built image ${newImageTag}`);
      await assertRun(deployment, runToken);
    } else {
      newImageTag = input.image;
      await ensureImage(newImageTag);
      deployment.containerPort = input.containerPort || await imageExposedPort(newImageTag);
      addLog(deployment, `Using allowlisted image ${newImageTag}`);
    }

    deployment.imageTag = newImageTag;
    await removeWorkspace(workspace);
    workspace = null;
    await assertRun(deployment, runToken);

    if (previous.containerId) {
      await removePreview(previous.containerId);
      deployment.containerId = "";
    }

    deployment.status = "starting";
    addLog(deployment, `Starting container on port ${deployment.hostPort}`);
    await persistQueued(deployment, runToken);

    const container = await createPreview({
      image: newImageTag,
      name: deployment.containerName,
      hostPort: deployment.hostPort,
      containerPort: deployment.containerPort,
      labels
    });
    newContainerId = container.id;
    deployment.containerId = container.id;
    await persistQueued(deployment, runToken);

    deployment.status = "checking";
    addLog(deployment, "Configuring Nginx route");
    await persistQueued(deployment, runToken);

    await configurePreview({
      projectName: input.projectName,
      branchName: input.branchName,
      previewUrl: deployment.previewUrl,
      hostPort: deployment.hostPort
    });

    addLog(deployment, `Waiting for health check ${input.healthcheckPath}`);
    await waitForHealthy(deployment.hostPort, input.healthcheckPath);

    deployment.status = "running";
    deployment.readyAt = new Date();
    deployment.durationMs = Date.now() - startedAt;
    deployment.errorMessage = "";
    addLog(deployment, `Preview ready at ${deployment.previewUrl}`);
    await persistQueued(deployment, runToken);

    if (previous.imageTag && previous.imageTag !== newImageTag) {
      await removeImage(previous.imageTag).catch(() => {});
    }
    return deployment;
  } catch (error) {
    if (newContainerId) {
      const runtimeLogs = await getLogs(newContainerId).catch(() => []);
      runtimeLogs.forEach((line) => addLog(deployment, line));
      await removePreview(newContainerId).catch(() => {});
    }
    if (workspace) await removeWorkspace(workspace).catch(() => {});

    if (error instanceof PipelineCancelled) {
      const latest = await findInternal(deployment._id);
      const newerRun = latest && latest.runToken !== runToken && ACTIVE_STATUSES.includes(latest.status);
      const active = await findActive(input.projectName, input.branchName);
      const replacement = active && String(active._id) !== String(deployment._id);
      if (!replacement) {
        if (!newerRun) {
          await removeProxy(input.projectName, input.branchName).catch(() => {});
        }
        if (newImageTag && await countActiveByImage(newImageTag, deployment._id) === 0) {
          await removeImage(newImageTag).catch(() => {});
        }
      }
      return deployment;
    }

    const current = await findByRunToken(deployment._id, runToken);
    if (current) {
      await removeProxy(input.projectName, input.branchName).catch(() => {});
      if (input.deploymentMode === "dockerfile" && newImageTag) await removeImage(newImageTag).catch(() => {});
    }

    deployment.containerId = "";
    deployment.status = "failed";
    deployment.errorMessage = safeErrorMessage(error);
    deployment.durationMs = Date.now() - startedAt;
    addLog(deployment, `Deployment failed: ${deployment.errorMessage}`);
    await persistQueued(deployment, runToken).catch(() => {});
    throw new AppError("Preview deployment failed", 500, "DEPLOYMENT_FAILED");
  }
}

async function createDeploymentFlow(input) {
  const existing = await findActive(input.projectName, input.branchName);
  if (existing) {
    throw new AppError("This branch already has an active preview", 409, "DUPLICATE_PREVIEW");
  }
  const activeCount = await countActiveByProject(input.projectName);
  if (activeCount >= env.MAX_ACTIVE_DEPLOYMENTS_PER_PROJECT) {
    throw new AppError(
      `This project already has ${env.MAX_ACTIVE_DEPLOYMENTS_PER_PROJECT} active previews`,
      429,
      "PREVIEW_LIMIT_REACHED"
    );
  }

  const deployment = await createRecord(input);
  setImmediate(() => {
    runPipeline(deployment, input).catch(() => {});
  });
  return publicDeployment(deployment);
}

async function getDeployments(projectName) {
  await reconcileDeployments();
  const deployments = await list();
  return deployments
    .filter((deployment) => !projectName || deployment.projectName === projectName)
    .map(publicDeployment);
}

async function reconcileDeployments() {
  const activeDeployments = await listActive();
  await Promise.all(activeDeployments.map(async (deployment) => {
    if (!deployment.containerId) {
      if (!staleWithoutContainer(deployment)) return;
      await markFailedWithoutContainer(
        deployment._id,
        deployment.status,
        "Preview stopped before a container was assigned.",
        "Preview marked failed because no container was assigned in time"
      );
      return;
    }
    if (!RUNNING_CONTAINER_STATUSES.includes(deployment.status)) return;
    const containerId = deployment.containerId;
    const running = await isPreviewRunning(containerId);
    if (running) return;

    const stopped = await markContainerStopped(
      deployment._id,
      containerId,
      "The preview container is no longer running.",
      "Preview stopped because its container is no longer running"
    );
    if (!stopped) return;
    await removePreview(containerId).catch(() => {});
    const replacement = await findActive(deployment.projectName, deployment.branchName);
    if (!replacement) {
      await removeProxy(deployment.projectName, deployment.branchName).catch(() => {});
    }
  }));

  const activeIds = new Set(activeDeployments.map((deployment) => deployment.containerId).filter(Boolean));
  const activeDeploymentIds = new Set(activeDeployments.map((deployment) => String(deployment._id)));
  const managed = await listManagedContainers();
  await Promise.all(managed.map(async (container) => {
    const owner = container.labels?.["deployforge.deployment"];
    if (activeIds.has(container.id) || (owner && activeDeploymentIds.has(owner))) return;
    await removePreview(container.id).catch(() => {});
  }));
}

async function getDeployment(id) {
  const deployment = await findById(id);
  if (!deployment) throw new AppError("Deployment not found", 404, "DEPLOYMENT_NOT_FOUND");

  if (RUNNING_CONTAINER_STATUSES.includes(deployment.status) && deployment.containerId) {
    const containerId = deployment.containerId;
    const running = await isPreviewRunning(containerId);
    if (!running) {
      const stopped = await markContainerStopped(
        deployment._id,
        containerId,
        "The preview container is no longer running.",
        "Preview stopped because its container is no longer running"
      );
      if (stopped) {
        await removePreview(containerId).catch(() => {});
        const replacement = await findActive(deployment.projectName, deployment.branchName);
        if (!replacement) {
          await removeProxy(deployment.projectName, deployment.branchName).catch(() => {});
        }
        return stopped;
      }
      return findById(id);
    }
  }
  if (ACTIVE_STATUSES.includes(deployment.status) && !deployment.containerId && staleWithoutContainer(deployment)) {
    const failed = await markFailedWithoutContainer(
      deployment._id,
      deployment.status,
      "Preview stopped before a container was assigned.",
      "Preview marked failed because no container was assigned in time"
    );
    if (failed) return failed;
    return findById(id);
  }
  return deployment;
}

async function getDeploymentStats(id) {
  const deployment = await getDeployment(id);
  return STATS_CONTAINER_STATUSES.includes(deployment.status) && deployment.containerId
    ? getStats(deployment.containerId)
    : { cpuPercent: 0, memoryUsage: 0, memoryLimit: 0 };
}

async function getDeploymentLogs(id) {
  const deployment = await getDeployment(id);
  const runtimeLogs = deployment.containerId ? await getLogs(deployment.containerId).catch(() => []) : [];
  const combined = [...deployment.logs, ...runtimeLogs];
  return { logs: combined.slice(-300) };
}

async function deleteDeployment(id) {
  const deployment = await getDeployment(id);
  const previousContainer = deployment.containerId;
  deployment.runToken = crypto.randomUUID();
  deployment.status = "stopped";
  deployment.containerId = "";
  addLog(deployment, "Preview removed");
  await deployment.save();

  if (previousContainer) await removePreview(previousContainer).catch(() => {});
  const replacement = await findActive(deployment.projectName, deployment.branchName);
  if (!replacement) {
    await removeProxy(deployment.projectName, deployment.branchName).catch(() => {});
    if (deployment.imageTag && deployment.deploymentMode === "dockerfile") {
      await removeImage(deployment.imageTag).catch(() => {});
    }
  }
  await deployment.deleteOne();
  return { id: String(deployment._id), deleted: true };
}

async function stopDeployment(id) {
  const deployment = await getDeployment(id);
  const previousContainer = deployment.containerId;
  deployment.runToken = crypto.randomUUID();
  deployment.status = "stopped";
  deployment.containerId = "";
  addLog(deployment, "Preview stopped");
  await deployment.save();

  if (previousContainer) await removePreview(previousContainer).catch(() => {});
  const replacement = await findActive(deployment.projectName, deployment.branchName);
  if (!replacement) {
    await removeProxy(deployment.projectName, deployment.branchName).catch(() => {});
  }
  return publicDeployment(deployment);
}

async function redeployDeployment(id, overrides = {}) {
  const deployment = await getDeployment(id);
  const input = {
    projectName: deployment.projectName,
    repositoryUrl: overrides.repositoryUrl || deployment.repositoryUrl,
    branchName: deployment.branchName,
    commitSha: overrides.commitSha || "",
    deploymentMode: deployment.deploymentMode,
    dockerfilePath: deployment.dockerfilePath,
    buildContext: deployment.buildContext,
    healthcheckPath: deployment.healthcheckPath,
    image: overrides.image || (deployment.deploymentMode === "image" ? deployment.imageTag : "nginx:alpine"),
    containerPort: deployment.containerPort
  };

  if (input.deploymentMode === "dockerfile" && !input.repositoryUrl) {
    throw new AppError("Deployment has no repository to redeploy", 400, "REPOSITORY_REQUIRED");
  }

  if (["cloning", "building", "starting", "checking"].includes(deployment.status)) {
    throw new AppError("This deployment is already in progress", 409, "DEPLOYMENT_IN_PROGRESS");
  }

  const previous = { containerId: deployment.containerId, imageTag: deployment.imageTag };
  const runToken = crypto.randomUUID();
  deployment.runToken = runToken;
  deployment.status = "building";
  addLog(deployment, "Redeploy requested");
  await deployment.save();
  setImmediate(() => {
    runPipeline(deployment, input, previous, runToken).catch(() => {});
  });
  return publicDeployment(deployment);
}

module.exports = {
  createDeployment: createDeploymentFlow,
  getDeployments,
  getDeployment,
  getDeploymentStats,
  getDeploymentLogs,
  stopDeployment,
  deleteDeployment,
  redeployDeployment,
  reconcileDeployments,
  publicDeployment
};
