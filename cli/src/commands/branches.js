const { resolveConfig } = require("../config");
const { createClient } = require("../api");
const { discoverBranches, normalizeRemoteUrl, isRepository, remoteUrl } = require("../git");
const { ui, pad } = require("../ui");

async function branches(options = {}) {
  const config = resolveConfig(options);
  let remote = [];
  let local = [];

  if (await isRepository(config.repo)) {
    local = await discoverBranches(config.repo, config.pattern, false);
  }

  const repoUrl = config.repoUrl || (await isRepository(config.repo)
    ? normalizeRemoteUrl(await remoteUrl(config.repo))
    : "");

  if (repoUrl && options.local !== true) {
    const client = createClient(config);
    const response = await client.branches(repoUrl);
    remote = response.branches || [];
  }

  if (options.json) {
    console.log(JSON.stringify({ remote, local: local.map((branch) => branch.name) }, null, 2));
    return { remote, local };
  }

  const remoteSet = new Set(remote);
  const names = [...new Set([...remote, ...local.map((branch) => branch.name)])].sort();
  if (names.length === 0) {
    ui.info("No branches found");
    return { remote, local };
  }

  console.log(`${pad("BRANCH", 40)} SOURCE`);
  for (const name of names) {
    const source = remoteSet.has(name) ? "origin" : "local only";
    console.log(`${pad(name, 40)} ${source}`);
  }
  return { remote, local };
}

module.exports = branches;
