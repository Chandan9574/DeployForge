const agent37 = require("../services/agent37Service");

async function create(request, response) {
  response.status(201).json(await agent37.createInstance());
}

async function list(request, response) {
  response.json(await agent37.listInstances());
}

async function getOne(request, response) {
  response.json(await agent37.getInstance(request.params.id));
}

async function exec(request, response) {
  response.json(await agent37.executeCommand(request.params.id, request.body.command));
}

async function message(request, response) {
  response.json(await agent37.sendMessage(request.params.id, request.body.input));
}

async function remove(request, response) {
  response.json(await agent37.deleteInstance(request.params.id));
}

async function createPublicPort(request, response) {
  response.status(201).json(await agent37.createPublicPort(
    request.params.id,
    Number(request.body.port),
    request.body.prefix,
    request.body.label
  ));
}

async function listPublicPorts(request, response) {
  response.json(await agent37.listPublicPorts(request.params.id));
}

async function deletePublicPort(request, response) {
  response.json(await agent37.deletePublicPort(request.params.id, Number(request.params.port)));
}

module.exports = {
  create,
  list,
  getOne,
  exec,
  message,
  remove,
  createPublicPort,
  listPublicPorts,
  deletePublicPort
};
