const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { PassThrough } = require("stream");
const Docker = require("dockerode");
const env = require("../config/env");
const AppError = require("../errors/AppError");
const { previewSlug } = require("../utils/preview");

const execFileAsync = promisify(execFile);
const docker = new Docker({ socketPath: env.DOCKER_SOCKET });
const configDir = env.NGINX_CONFIG_DIR;

function configFile(projectName, branchName) {
  return path.join(configDir, `${previewSlug(projectName, branchName)}.conf`);
}

function proxyBlock(hostPort) {
  return `  location / {
    proxy_pass http://${env.PREVIEW_PROXY_HOST}:${hostPort};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    client_max_body_size 20m;
  }`;
}

function renderConfig({ host, hostPort, tlsEnabled }) {
  if (!tlsEnabled) {
    return `server {
  listen 80;
  server_name ${host};

${proxyBlock(hostPort)}
}
`;
  }

  return `server {
  listen 80;
  server_name ${host};
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ${host};

  ssl_certificate ${env.TLS_CERT_PATH};
  ssl_certificate_key ${env.TLS_KEY_PATH};
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:DeployForgeTLS:10m;
  ssl_session_timeout 1h;

${proxyBlock(hostPort)}
}
`;
}

function nginxTestArgs() {
  return env.NGINX_MAIN_CONFIG ? ["-t", "-c", env.NGINX_MAIN_CONFIG] : ["-t"];
}

function nginxReloadArgs() {
  return env.NGINX_MAIN_CONFIG ? ["-c", env.NGINX_MAIN_CONFIG, "-s", "reload"] : ["-s", "reload"];
}

async function execInNginxContainer(args) {
  const container = docker.getContainer(env.NGINX_CONTAINER_NAME);
  const exec = await container.exec({
    Cmd: ["nginx", ...args],
    AttachStdout: true,
    AttachStderr: true
  });
  const stream = await exec.start({});
  const output = [];
  await new Promise((resolve, reject) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.on("data", (chunk) => output.push(chunk.toString()));
    stderr.on("data", (chunk) => output.push(chunk.toString()));
    docker.modem.demuxStream(stream, stdout, stderr);
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const inspection = await exec.inspect();
  if (inspection.ExitCode !== 0) {
    throw new AppError(`Nginx command failed: ${output.join("").trim().slice(0, 500)}`, 500, "NGINX_RELOAD_FAILED");
  }
}

async function runNginx(args) {
  if (env.NGINX_RELOAD_MODE === "docker") {
    await execInNginxContainer(args);
    return;
  }

  try {
    await execFileAsync("nginx", args, { timeout: 15000 });
  } catch (error) {
    const detail = `${error.stderr || ""} ${error.stdout || ""}`.trim().slice(0, 500);
    throw new AppError(detail || "Nginx command failed", 500, "NGINX_RELOAD_FAILED");
  }
}

async function testAndReload() {
  await runNginx(nginxTestArgs());
  if (env.NGINX_RELOAD_MODE === "systemd") {
    await execFileAsync("systemctl", ["reload", "nginx"], { timeout: 15000 });
    return;
  }
  await runNginx(nginxReloadArgs());
}

async function writeAtomically(file, content) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, content, { mode: 0o644 });
  await fs.rename(temporary, file);
}

async function restore(file, previous) {
  if (previous === null) {
    await fs.rm(file, { force: true });
  } else {
    await writeAtomically(file, previous);
  }
}

async function configurePreview({ projectName, branchName, previewUrl, hostPort }) {
  await fs.mkdir(configDir, { recursive: true });
  const file = configFile(projectName, branchName);
  const host = new URL(previewUrl).hostname;
  const content = renderConfig({ host, hostPort, tlsEnabled: env.TLS_ENABLED === "true" });
  let previous = null;
  try {
    previous = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await writeAtomically(file, content);
  if (env.NGINX_ENABLED !== "true") return file;

  try {
    await testAndReload();
    return file;
  } catch (error) {
    await restore(file, previous).catch(() => {});
    await testAndReload().catch(() => {});
    throw error;
  }
}

async function removePreview(projectName, branchName) {
  const file = configFile(projectName, branchName);
  let previous;
  try {
    previous = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  await fs.rm(file, { force: true });
  if (env.NGINX_ENABLED !== "true") return;

  try {
    await testAndReload();
  } catch (error) {
    await writeAtomically(file, previous).catch(() => {});
    throw error;
  }
}

module.exports = { configurePreview, removePreview, renderConfig, configFile };
