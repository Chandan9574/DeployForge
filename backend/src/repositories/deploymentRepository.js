const Deployment = require("../models/Deployment");

function findActive(projectName, branchName) {
  return Deployment.findOne({
    projectName,
    branchName,
    status: { $in: ["pending", "building", "starting", "running"] }
  });
}

function list() {
  return Deployment.find().sort({ createdAt: -1 }).limit(100).lean();
}

function findById(id) {
  return Deployment.findById(id);
}

function findUsedPorts() {
  return Deployment.find({ status: { $in: ["pending", "building", "starting", "running"] } }, "hostPort").lean();
}

module.exports = { Deployment, findActive, list, findById, findUsedPorts };
