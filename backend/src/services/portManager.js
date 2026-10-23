const { findUsedPorts } = require("../repositories/deploymentRepository");

async function reservePort(start, end) {
  const deployments = await findUsedPorts();
  const used = new Set(deployments.map((item) => item.hostPort));

  for (let port = start; port <= end; port += 1) {
    if (!used.has(port)) return port;
  }

  throw new Error("No preview ports are available");
}

module.exports = { reservePort };
