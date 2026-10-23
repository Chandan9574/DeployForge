const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const env = require("../config/env");

const execFileAsync = promisify(execFile);
const configDir = path.join(process.cwd(), "deployments");

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function configurePreview({ branchName, previewUrl, hostPort }) {
  await fs.mkdir(configDir, { recursive: true });
  const file = path.join(configDir, `${safeName(branchName)}.conf`);
  const config = `server {
  listen 80;
  server_name ${new URL(previewUrl).hostname};

  location / {
    proxy_pass http://127.0.0.1:${hostPort};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
`;
  await fs.writeFile(file, config);

  if (env.NGINX_ENABLED !== "true") return file;
  await execFileAsync("nginx", ["-t"]);
  await execFileAsync("systemctl", ["reload", "nginx"]);
  return file;
}

async function removePreview(branchName) {
  const file = path.join(configDir, `${safeName(branchName)}.conf`);
  await fs.rm(file, { force: true });
  if (env.NGINX_ENABLED === "true") {
    await execFileAsync("nginx", ["-t"]);
    await execFileAsync("systemctl", ["reload", "nginx"]);
  }
}

module.exports = { configurePreview, removePreview };
