const net = require("net");
const env = require("../config/env");
const { findUsedPorts } = require("../repositories/deploymentRepository");
const AppError = require("../errors/AppError");

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: env.DOCKER_BIND_HOST, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function reservePort(start, end, additionalUsed = new Set()) {
  const deployments = await findUsedPorts();
  const used = new Set(deployments.map((item) => item.hostPort));
  for (const port of additionalUsed) used.add(port);

  for (let port = start; port <= end; port += 1) {
    if (!used.has(port) && await portAvailable(port)) return port;
  }

  throw new AppError("No preview ports are available", 503, "NO_PORTS_AVAILABLE");
}

module.exports = { reservePort };
