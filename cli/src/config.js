const fs = require("fs");
const path = require("path");

const CONFIG_DIRECTORY = ".deployforge";
const CONFIG_FILE = "config.json";
const DEFAULT_API_URL = "http://localhost:4000";

function normalizeApiUrl(value) {
  return String(value || DEFAULT_API_URL)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
}

function configPath(repo) {
  return path.join(path.resolve(repo), CONFIG_DIRECTORY, CONFIG_FILE);
}

function statePath(repo) {
  return path.join(path.resolve(repo), CONFIG_DIRECTORY, "state.json");
}

function readProjectConfig(repo) {
  try {
    return JSON.parse(fs.readFileSync(configPath(repo), "utf8"));
  } catch {
    return {};
  }
}

function writeProjectConfig(repo, config) {
  const file = configPath(repo);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  return file;
}

function ensureProjectIgnored(repo) {
  const file = path.join(path.resolve(repo), ".gitignore");
  let contents = "";
  try {
    contents = fs.readFileSync(file, "utf8");
  } catch {
    contents = "";
  }
  const entry = `${CONFIG_DIRECTORY}/`;
  const lines = contents.split(/\r?\n/);
  if (lines.includes(entry) || lines.includes(CONFIG_DIRECTORY)) return false;
  const prefix = contents && !contents.endsWith("\n") ? `${contents}\n` : contents;
  fs.writeFileSync(file, `${prefix}${entry}\n`);
  return true;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveConfig(options = {}) {
  const repo = path.resolve(options.repo || process.cwd());
  const stored = readProjectConfig(repo);
  const env = process.env;
  const image = options.image ?? env.DEPLOYFORGE_IMAGE ?? stored.image ?? "";

  return {
    repo,
    apiUrl: normalizeApiUrl(options.api || env.DEPLOYFORGE_API_URL || stored.apiUrl),
    project: options.project || env.DEPLOYFORGE_PROJECT || stored.project || path.basename(repo),
    repoUrl: options.repoUrl || env.DEPLOYFORGE_REPO_URL || stored.repositoryUrl || "",
    deploymentMode: image ? "image" : (stored.deploymentMode || "dockerfile"),
    dockerfilePath: options.dockerfile || stored.dockerfilePath || "Dockerfile",
    buildContext: options.context || stored.buildContext || ".",
    healthPath: options.healthPath || stored.healthcheckPath || "/",
    image,
    token: env.DEPLOYFORGE_TOKEN || "",
    intervalMs: positiveNumber(options.interval, positiveNumber(Number(env.DEPLOYFORGE_POLL_MS) / 1000, 3)) * 1000,
    pattern: options.pattern || stored.pattern || "*",
    preferRemote: options.remote !== false,
    timeoutMs: positiveNumber(options.timeout, positiveNumber(Number(env.DEPLOYFORGE_TIMEOUT_MS) / 1000, 20)) * 1000
  };
}

module.exports = {
  CONFIG_DIRECTORY,
  DEFAULT_API_URL,
  configPath,
  ensureProjectIgnored,
  normalizeApiUrl,
  readProjectConfig,
  resolveConfig,
  statePath,
  writeProjectConfig
};
