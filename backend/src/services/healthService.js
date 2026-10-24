const net = require("net");
const http = require("http");
const env = require("../config/env");
const AppError = require("../errors/AppError");

function tcpReady(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: env.HEALTHCHECK_HOST, port });
    const finish = (ready) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function httpReady(port, pathname) {
  return new Promise((resolve) => {
    const request = http.get(
      { host: env.HEALTHCHECK_HOST, port, path: pathname || "/", timeout: 1500 },
      (response) => {
        response.resume();
        resolve(response.statusCode < 500);
      }
    );
    request.once("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.once("error", () => resolve(false));
  });
}

async function waitForHealthy(hostPort, healthcheckPath) {
  if (env.USE_MOCK_DOCKER === "true") return true;

  const deadline = Date.now() + env.DEPLOYMENT_READY_TIMEOUT_MS;
  let lastError = "The application did not become ready";

  while (Date.now() < deadline) {
    if (await tcpReady(hostPort)) {
      if (!healthcheckPath) return true;
      if (await httpReady(hostPort, healthcheckPath)) return true;
      lastError = `Health check ${healthcheckPath} did not return a successful response`;
    } else {
      lastError = "The application port is not accepting connections";
    }
    await new Promise((resolve) => setTimeout(resolve, env.HEALTHCHECK_INTERVAL_MS));
  }

  throw new AppError(lastError, 500, "HEALTHCHECK_FAILED");
}

module.exports = { waitForHealthy, tcpReady, httpReady };
