const path = require("path");
const {
  DEFAULT_API_URL,
  ensureProjectIgnored,
  normalizeApiUrl,
  readProjectConfig,
  writeProjectConfig
} = require("../config");
const { createClient } = require("../api");
const { currentBranch, isRepository, normalizeRemoteUrl, remoteUrl } = require("../git");
const { ui } = require("../ui");

async function init(directory, options = {}) {
  const repo = path.resolve(options.repo || directory || process.cwd());
  const repository = await isRepository(repo);
  const previous = readProjectConfig(repo);

  const repoUrl = normalizeRemoteUrl(
    options.repoUrl ||
    previous.repositoryUrl ||
    (repository ? await remoteUrl(repo) : "")
  );

  if (!repoUrl && !options.image) {
    throw new Error(
      "No origin remote found. Pass --repo-url <https://host/owner/repo> or --image <allowlisted-image>."
    );
  }

  const forceDockerfile = Boolean(options.repoUrl || options.dockerfile || options.context) && !options.image;
  const image = forceDockerfile ? "" : (options.image || previous.image || "");
  const deploymentMode = image ? "image" : "dockerfile";
  const project = options.project ||
    process.env.DEPLOYFORGE_PROJECT ||
    previous.project ||
    path.basename(repo);
  const apiUrl = normalizeApiUrl(options.api || process.env.DEPLOYFORGE_API_URL || previous.apiUrl || DEFAULT_API_URL);

  const config = {
    apiUrl,
    project,
    repositoryUrl: repoUrl,
    deploymentMode,
    healthcheckPath: options.healthPath || previous.healthcheckPath || "/",
    pattern: options.pattern || previous.pattern || "*"
  };

  if (deploymentMode === "image") {
    config.image = image;
  } else {
    config.dockerfilePath = options.dockerfile || previous.dockerfilePath || "Dockerfile";
    config.buildContext = options.context || previous.buildContext || ".";
  }

  const file = writeProjectConfig(repo, config);
  ensureProjectIgnored(repo);

  ui.ok(`Project configuration written to ${file}`);
  ui.step(`API      ${apiUrl}`);
  ui.step(`Project  ${project}`);
  if (deploymentMode === "image") {
    ui.step(`Mode     image (${image})`);
  } else {
    ui.step(`Mode     dockerfile (${config.dockerfilePath}, context ${config.buildContext})`);
    ui.step(`Repo     ${repoUrl}`);
  }

  if (options.check !== false) {
    try {
      await createClient({ apiUrl, token: process.env.DEPLOYFORGE_TOKEN || "" }).health();
      ui.ok("DeployForge API is reachable");
    } catch (error) {
      ui.warn(error.message);
      ui.info("Start the backend with: npm run backend:dev");
    }
  }

  if (options.deploy || options.watch) {
    const branch = await currentBranch(repo);
    if (options.deploy && !branch) throw new Error("Could not determine the current Git branch");
    const shared = {
      ...options,
      repo,
      api: apiUrl,
      project,
      repoUrl,
      dockerfile: config.dockerfilePath,
      context: config.buildContext,
      healthPath: config.healthcheckPath,
      pattern: config.pattern
    };

    if (options.deploy) {
      const deploy = require("./deploy");
      await deploy([branch], shared);
    }
    if (options.watch) {
      const watch = require("./watch");
      await watch(shared);
    }
  } else {
    ui.title("Next steps");
    ui.step("Deploy the current branch: deployforge deploy");
    ui.step("Deploy every remote branch: deployforge deploy --all");
    ui.step("Keep every branch in sync: deployforge watch");
  }
}

module.exports = init;
