const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { ui, formatBytes, pad } = require("../ui");

async function list(options = {}) {
  const config = resolveConfig(options);
  const client = createClient(config);
  const deployments = await client.list(options.all ? "" : config.project);

  if (options.json) {
    console.log(JSON.stringify(deployments, null, 2));
    return deployments;
  }

  if (deployments.length === 0) {
    ui.info("No deployments found");
    return deployments;
  }

  const rows = [];
  for (const deployment of deployments) {
    let stats = null;
    if (options.stats && deployment.status === "running") {
      stats = await client.stats(deployment._id).catch(() => null);
    }
    rows.push({
      project: pad(deployment.projectName, 18),
      branch: pad(deployment.branchName, 28),
      status: pad(deployment.status, 10),
      port: pad(deployment.hostPort || "-", 6),
      cpu: pad(stats ? `${stats.cpuPercent}%` : "-", 8),
      memory: pad(stats ? formatBytes(stats.memoryUsage) : "-", 9),
      url: deployment.previewUrl || "-"
    });
  }

  if (options.all) {
    console.log(`${pad("PROJECT", 18)} ${pad("BRANCH", 28)} ${pad("STATUS", 10)} ${pad("PORT", 6)} ${pad("CPU", 8)} ${pad("MEMORY", 9)} URL`);
  } else {
    console.log(`${pad("BRANCH", 28)} ${pad("STATUS", 10)} ${pad("PORT", 6)} ${pad("CPU", 8)} ${pad("MEMORY", 9)} URL`);
  }
  for (const row of rows) {
    const prefix = options.all ? `${row.project} ` : "";
    console.log(`${prefix}${row.branch} ${row.status} ${row.port} ${row.cpu} ${row.memory} ${row.url}`);
  }
  return deployments;
}

module.exports = list;
