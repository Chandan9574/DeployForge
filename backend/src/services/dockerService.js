const { PassThrough } = require("stream");
const Docker = require("dockerode");
const env = require("../config/env");

const docker = new Docker({ socketPath: env.DOCKER_SOCKET });

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
      "/tmp": "rw,nosuid,nodev,size=64m",
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
    config.CapAdd = ["CHOWN", "SETGID", "SETUID"];
    if (containerPort < 1024) {
      config.CapAdd.push("NET_BIND_SERVICE");
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
        [`${containerPort}/tcp`]: [{ HostIp: env.DOCKER_BIND_HOST, HostPort: String(hostPort) }]
      },
      ...hostConfig(containerPort)
    },
    User: env.DOCKER_CONTAINER_USER || undefined
  });
  await container.start();
  return { id: container.id, name };
}

async function removePreview(containerId) {
  if (useMockDocker() || !containerId) return;
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
  if (!containerId) return false;

  const container = docker.getContainer(containerId);
  try {
    const details = await container.inspect();
    return details.State?.Running === true;
  } catch (error) {
    if (error.statusCode === 404) return false;
    throw error;
  }
}

async function listManagedContainers() {
  if (useMockDocker()) return [];
  const containers = await docker.listContainers({ all: true });
  return containers
    .filter((container) => container.Labels?.["deployforge.managed"] === "true")
    .map((container) => ({
      id: container.Id,
      name: container.Names?.[0]?.replace(/^\//, "") || "",
      running: container.State === "running",
      labels: container.Labels || {}
    }));
}

async function getStats(containerId) {
  if (useMockDocker()) {
    const seed = String(containerId).split("").reduce((total, char) => total + char.charCodeAt(0), 0);
    const wave = (Math.sin(Date.now() / 4000) + 1) / 2;
    return {
      cpuPercent: Number((1.5 + wave * 4 + (seed % 20) / 10).toFixed(2)),
      memoryUsage: Math.round((38 + wave * 9 + (seed % 6)) * 1024 * 1024),
      memoryLimit: env.DOCKER_MEMORY_MB * 1024 * 1024
    };
  }

  const container = docker.getContainer(containerId);
  const stats = await container.stats({ stream: false });
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

  return {
    cpuPercent: Number(cpuPercent.toFixed(2)),
    memoryUsage: stats.memory_stats.usage || 0,
    memoryLimit: stats.memory_stats.limit || 0
  };
}

async function getLogs(containerId) {
  if (useMockDocker()) return ["Mock Docker is enabled. No container logs are available."];
  if (!containerId) return [];

  const container = docker.getContainer(containerId);
  const stream = await container.logs({ stdout: true, stderr: true, tail: 200, timestamps: false });
  return new Promise((resolve, reject) => {
    const lines = [];
    let pending = "";
    const append = (chunk) => {
      pending += chunk.toString();
      const parts = pending.split("\n");
      pending = parts.pop() || "";
      for (const line of parts) {
        if (line.trim()) lines.push(line.trim());
      }
    };

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.on("data", append);
    stderr.on("data", append);

    docker.modem.demuxStream(stream, stdout, stderr);
    stream.on("error", reject);
    stream.on("end", () => {
      if (pending.trim()) lines.push(pending.trim());
      resolve(lines.slice(-200));
    });
  });
}

module.exports = {
  createPreview,
  removePreview,
  isPreviewRunning,
  listManagedContainers,
  getStats,
  getLogs,
  ensureImage
};
