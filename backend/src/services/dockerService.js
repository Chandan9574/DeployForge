const Docker = require("dockerode");
const env = require("../config/env");

const docker = new Docker({
  socketPath: env.DOCKER_SOCKET
});

function useMockDocker() {
  return env.USE_MOCK_DOCKER === "true";
}

function hostConfig(containerPort) {
  const config = {
    Memory: env.DOCKER_MEMORY_MB * 1024 * 1024,
    NanoCpus: env.DOCKER_CPU_UNITS,
    PidsLimit: env.DOCKER_PIDS_LIMIT,
    Privileged: false,
    AutoRemove: false
  };

  if (env.DOCKER_READ_ONLY_ROOTFS === "true") {
    config.ReadonlyRootfs = true;
    config.Tmpfs = {
      "/tmp": "rw,nosuid,nodev,size=32m",
      "/run": "rw,nosuid,nodev,size=16m",
      "/var/run": "rw,nosuid,nodev,size=16m",
      "/var/cache/nginx": "rw,nosuid,nodev,size=64m"
    };
  }

  if (env.DOCKER_NO_NEW_PRIVILEGES === "true") {
    config.SecurityOpt = ["no-new-privileges:true"];
  }

  if (env.DOCKER_DROP_ALL_CAPS === "true") {
    config.CapDrop = ["ALL"];
    if (containerPort < 1024) {
      config.CapAdd = ["NET_BIND_SERVICE"];
    }
  }

  return config;
}

async function ensureImage(image) {
  if (useMockDocker()) return;

  try {
    await docker.getImage(image).inspect();
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    console.log(`Pulling Docker image ${image}`);
    const stream = await docker.pull(image);
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (pullError) => {
        if (pullError) reject(pullError);
        else resolve();
      });
    });
  }
}

async function createPreview({ image, name, hostPort, containerPort, labels }) {
  if (useMockDocker()) {
    return { id: `mock-${Date.now()}`, name };
  }

  await ensureImage(image);
  const container = await docker.createContainer({
    Image: image,
    name,
    Labels: labels,
    ExposedPorts: { [`${containerPort}/tcp`]: {} },
    HostConfig: {
      PortBindings: {
        [`${containerPort}/tcp`]: [{ HostPort: String(hostPort) }]
      },
      ...hostConfig(containerPort)
    },
    User: env.DOCKER_CONTAINER_USER || undefined
  });
  await container.start();
  return { id: container.id, name };
}

async function removePreview(containerId) {
  if (useMockDocker()) return;
  const container = docker.getContainer(containerId);
  try {
    await container.stop({ t: 5 });
  } catch (error) {
    if (error.statusCode !== 304 && error.statusCode !== 404) throw error;
  }
  try {
    await container.remove({ force: true });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
}

async function isPreviewRunning(containerId) {
  if (useMockDocker()) return true;

  const container = docker.getContainer(containerId);
  try {
    const details = await container.inspect();
    return details.State?.Running === true;
  } catch (error) {
    if (error.statusCode === 404) return false;
    throw error;
  }
}

async function getStats(containerId) {
  if (useMockDocker()) {
    return { cpuPercent: 0, memoryUsage: 0, memoryLimit: 0 };
  }

  const container = docker.getContainer(containerId);
  const stats = await container.stats({ stream: false });
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

  return {
    cpuPercent: Number(cpuPercent.toFixed(2)),
    memoryUsage: stats.memory_stats.usage || 0,
    memoryLimit: stats.memory_stats.limit || 0
  };
}

async function getLogs(containerId) {
  if (useMockDocker()) return ["Mock Docker is enabled. No container logs are available."];
  const container = docker.getContainer(containerId);
  const stream = await container.logs({ stdout: true, stderr: true, tail: 200 });
  return stream.toString().split("\n").filter(Boolean);
}

module.exports = { createPreview, removePreview, isPreviewRunning, getStats, getLogs };
