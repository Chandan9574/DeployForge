const path = require("path");

function resolveConfig(options = {}) {
  const repo = path.resolve(options.repo || process.cwd());
  return {
    apiUrl: (options.api || process.env.DEPLOYFORGE_API_URL || "http://localhost:4000").replace(/\/$/, ""),
    project: options.project || process.env.DEPLOYFORGE_PROJECT || path.basename(repo),
    repo,
    token: process.env.DEPLOYFORGE_TOKEN || "",
    intervalMs: Math.max(1, Number(options.interval || Number(process.env.DEPLOYFORGE_POLL_MS || 0) / 1000 || 3)) * 1000,
    pattern: options.pattern || "*",
    preferRemote: options.remote !== false,
    timeoutMs: Math.max(1, Number(options.timeout || 20)) * 1000
  };
}

module.exports = { resolveConfig };
