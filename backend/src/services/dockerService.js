const Docker = require("dockerode");
const env = require("../config/env");

const docker = new Docker({
  socketPath: env.DOCKER_SOCKET
});

function useMockDocker() {
  return env.USE_MOCK_DOCKER === "true";
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
      Memory: 512 * 1024 * 1024,
      NanoCpus: 500000000,
      AutoRemove: false
    }
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
  await container.remove({ force: true });
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

module.exports = { createPreview, removePreview, getStats, getLogs };
