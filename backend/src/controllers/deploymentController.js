const env = require("../config/env");
const { validateDeployment } = require("../validators/deploymentValidator");
const deploymentService = require("../services/deploymentService");
const validateObjectId = require("../utils/validateObjectId");

async function create(request, response) {
  const input = validateDeployment(request.body, env.allowedImages);
  response.status(201).json(await deploymentService.createDeployment(input));
}

async function list(request, response) {
  response.json(await deploymentService.getDeployments());
}

async function getOne(request, response) {
  response.json(await deploymentService.getDeployment(validateObjectId(request.params.id)));
}

async function stats(request, response) {
  response.json(await deploymentService.getDeploymentStats(validateObjectId(request.params.id)));
}

async function logs(request, response) {
  response.json(await deploymentService.getDeploymentLogs(validateObjectId(request.params.id)));
}

async function remove(request, response) {
  response.json(await deploymentService.stopDeployment(validateObjectId(request.params.id)));
}

module.exports = { create, list, getOne, stats, logs, remove };
