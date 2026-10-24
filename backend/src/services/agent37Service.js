const AppError = require("../errors/AppError");
const env = require("../config/env");

const requestTimeoutMs = 15000;

function ensureConfigured() {
  if (env.AGENT37_ENABLED !== "true" || !env.AGENT37_API_KEY) {
    throw new AppError("Agent37 integration is not enabled", 503, "AGENT37_NOT_CONFIGURED");
  }
}

function instanceId(instance) {
  return instance.id || instance.instanceId || instance._id;
}

async function agent37Request(path, options = {}) {
  ensureConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${env.AGENT37_API_BASE_URL.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${env.AGENT37_API_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: "Agent37 returned an invalid response" };
    }
    if (!response.ok) {
      throw new AppError(
        `Agent37 request failed with status ${response.status}`,
        response.status >= 500 ? 502 : response.status,
        "AGENT37_REQUEST_FAILED"
      );
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError("Agent37 request timed out", 504, "AGENT37_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function instanceRequest(id, path, options = {}) {
  ensureConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`https://${id}.${env.AGENT37_INSTANCE_DOMAIN}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Agent37-Key": env.AGENT37_API_KEY,
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: "Agent37 returned an invalid response" };
    }
    if (!response.ok) {
      throw new AppError(body.message || "Agent37 request failed", response.status >= 500 ? 502 : response.status, "AGENT37_REQUEST_FAILED");
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError("Agent37 request timed out", 504, "AGENT37_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function createInstance() {
  const body = env.AGENT37_TEMPLATE ? { template: env.AGENT37_TEMPLATE } : {};
  return agent37Request("/instances", { method: "POST", body: JSON.stringify(body) });
}

function listInstances() {
  return agent37Request("/instances");
}

async function getInstance(id) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new AppError("Invalid Agent37 instance ID", 400, "INVALID_INSTANCE_ID");
  }
  return agent37Request(`/instances/${encodeURIComponent(id)}`);
}

async function executeCommand(id, command) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new AppError("Invalid Agent37 instance ID", 400, "INVALID_INSTANCE_ID");
  }
  if (typeof command !== "string" || command.trim().length === 0 || command.length > 4000) {
    throw new AppError("A command between 1 and 4000 characters is required", 400, "INVALID_COMMAND");
  }
  return agent37Request(`/instances/${encodeURIComponent(id)}/exec`, {
    method: "POST",
    body: JSON.stringify({ command })
  });
}

async function sendMessage(id, input) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new AppError("Invalid Agent37 instance ID", 400, "INVALID_INSTANCE_ID");
  }
  if (typeof input !== "string" || input.trim().length === 0 || input.length > 10000) {
    throw new AppError("A message between 1 and 10000 characters is required", 400, "INVALID_MESSAGE");
  }
  return instanceRequest(id, "/v1/responses", {
    method: "POST",
    body: JSON.stringify({ input })
  });
}

function deleteInstance(id) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new AppError("Invalid Agent37 instance ID", 400, "INVALID_INSTANCE_ID");
  }
  return agent37Request(`/instances/${encodeURIComponent(id)}`, { method: "DELETE" });
}

function validatePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 22022) {
    throw new AppError("Invalid or restricted Agent37 port", 400, "INVALID_AGENT37_PORT");
  }
}

async function createPublicPort(id, port, prefix, label) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new AppError("Invalid Agent37 instance ID", 400, "INVALID_INSTANCE_ID");
  }
  validatePort(port);
  const body = { port };
  if (prefix) body.prefix = prefix;
  if (label) body.label = label;
  try {
    return await agent37Request(`/instances/${encodeURIComponent(id)}/public-ports`, {
      method: "POST",
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error.statusCode !== 409) throw error;
    const existing = await listPublicPorts(id);
    const ports = Array.isArray(existing) ? existing : existing.ports || [];
    const match = ports.find((publicPort) => publicPort.port === port);
    if (!match || !match.url) throw error;
    return match;
  }
}

function listPublicPorts(id) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new AppError("Invalid Agent37 instance ID", 400, "INVALID_INSTANCE_ID");
  }
  return agent37Request(`/instances/${encodeURIComponent(id)}/public-ports`);
}

async function deletePublicPort(id, port) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new AppError("Invalid Agent37 instance ID", 400, "INVALID_INSTANCE_ID");
  }
  validatePort(port);
  return agent37Request(`/instances/${encodeURIComponent(id)}/public-ports/${port}`, { method: "DELETE" });
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function prepareRepository(id, repositoryUrl, branchName) {
  const command = [
    "set -eu",
    "rm -rf /home/node/deployforge-repo",
    `git clone --depth 1 --single-branch --branch ${shellQuote(branchName)} ${shellQuote(repositoryUrl)} /home/node/deployforge-repo`,
    "cd /home/node/deployforge-repo",
    "if [ -f package.json ]; then npm install --no-audit --no-fund; fi",
    "if [ -f package.json ] && npm run | grep -q ' build'; then npm run build; fi"
  ].join(" && ");
  return executeCommand(id, command);
}

async function startApplication(id, port, healthPath) {
  validatePort(port);
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(healthPath)) {
    throw new AppError("Invalid Agent37 health path", 400, "INVALID_HEALTH_PATH");
  }
  const command = `set -eu
cd /home/node/deployforge-repo
: > /tmp/deployforge-app.log
nohup sh -c ${shellQuote(`exec env PORT=${port} node src/index.js`)} </dev/null >> /tmp/deployforge-app.log 2>&1 &
app_pid=$!
ready=
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:${port}${healthPath} >/dev/null; then
    ready=yes
    break
  fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [ "$ready" != yes ]; then
  cat /tmp/deployforge-app.log >&2
  exit 1
fi`;
  return executeCommand(id, command);
}

module.exports = {
  createInstance,
  listInstances,
  getInstance,
  executeCommand,
  prepareRepository,
  startApplication,
  createPublicPort,
  listPublicPorts,
  deletePublicPort,
  sendMessage,
  deleteInstance,
  instanceId
};
