const env = require("../config/env");
const { validateDeployment, validateRedeploy } = require("../validators/deploymentValidator");
const deploymentService = require("../services/deploymentService");
const { assertRepositoryUrl, listRemoteBranches } = require("../services/gitService");
const validateObjectId = require("../utils/validateObjectId");

async function create(request, response) {
  const input = validateDeployment(request.body, {
    allowedImages: env.allowedImages,
    defaultRepositoryUrl: env.DEFAULT_REPOSITORY_URL,
    allowPrivateRepos: env.ALLOW_PRIVATE_REPOS === "true"
  });
  if (input.deploymentMode === "dockerfile") {
    await assertRepositoryUrl(input.repositoryUrl);
  }
  response.status(201).json(await deploymentService.createDeployment(input));
}

async function config(request, response) {
  response.json({
    previewDomain: env.PREVIEW_DOMAIN,
    previewScheme: env.PREVIEW_SCHEME,
    defaultRepositoryUrl: env.DEFAULT_REPOSITORY_URL,
    deploymentMode: "dockerfile",
    allowedImages: env.allowedImages,
    mockDocker: env.USE_MOCK_DOCKER === "true",
    nginxEnabled: env.NGINX_ENABLED === "true"
  });
}

async function list(request, response) {
  const project = typeof request.query.project === "string" ? request.query.project.slice(0, 60) : "";
  response.json(await deploymentService.getDeployments(project));
}

async function getOne(request, response) {
  response.json(deploymentService.publicDeployment(await deploymentService.getDeployment(validateObjectId(request.params.id))));
}

async function stats(request, response) {
  response.json(await deploymentService.getDeploymentStats(validateObjectId(request.params.id)));
}

async function logs(request, response) {
  response.json(await deploymentService.getDeploymentLogs(validateObjectId(request.params.id)));
}

async function remove(request, response) {
  response.json(await deploymentService.deleteDeployment(validateObjectId(request.params.id)));
}

async function restart(request, response) {
  const overrides = validateRedeploy(request.body);
  response.json(await deploymentService.redeployDeployment(validateObjectId(request.params.id), overrides));
}

async function stop(request, response) {
  response.json(await deploymentService.stopDeployment(validateObjectId(request.params.id)));
}

async function listBranches(request, response) {
  const { repo } = request.query;
  if (!repo || typeof repo !== "string") {
    return response.status(400).json({ message: "repo query parameter is required" });
  }
  await assertRepositoryUrl(repo.trim());
  const branches = await listRemoteBranches(repo.trim());
  response.json({ branches });
}

module.exports = { create, config, list, getOne, stats, logs, remove, restart, stop, listBranches };
