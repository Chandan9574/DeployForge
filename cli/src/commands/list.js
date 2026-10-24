const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { ui, formatBytes } = require("../ui");

function pad(value, width) {
  return String(value).padEnd(width).slice(0, width);
}

async function list(options) {
  const config = resolveConfig(options);
  const client = createClient(config);
  const deployments = await client.list(config.project);

  if (deployments.length === 0) {
    ui.info("No deployments found");
    return;
  }

  const rows = [];
  for (const deployment of deployments) {
    let stats = null;
    if (options.stats && deployment.status === "running") {
      stats = await client.stats(deployment._id).catch(() => null);
    }
    rows.push({
      branch: pad(deployment.branchName, 28),
      status: pad(deployment.status, 10),
      port: pad(deployment.hostPort || "-", 6),
      cpu: pad(stats ? `${stats.cpuPercent}%` : "-", 7),
      memory: pad(stats ? formatBytes(stats.memoryUsage) : "-", 9),
      url: deployment.previewUrl || "-"
    });
  }

  console.log(`${pad("BRANCH", 28)} ${pad("STATUS", 10)} ${pad("PORT", 6)} ${pad("CPU", 7)} ${pad("MEMORY", 9)} URL`);
  for (const row of rows) {
    console.log(`${row.branch} ${row.status} ${row.port} ${row.cpu} ${row.memory} ${row.url}`);
  }
}

module.exports = list;
