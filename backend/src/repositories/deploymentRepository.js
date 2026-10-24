const Deployment = require("../models/Deployment");
const { ACTIVE_STATUSES } = require("../constants");

function markFailedWithoutContainer(id, status, errorMessage, logLine) {
  return Deployment.findOneAndUpdate(
    { _id: id, status, containerId: "" },
    {
      $set: { status: "failed", errorMessage },
      $push: { logs: { $each: [logLine], $slice: -500 } }
    },
    { new: true }
  );
}

function markContainerStopped(id, containerId, errorMessage, logLine) {
  return Deployment.findOneAndUpdate(
    {
      _id: id,
      containerId,
      status: { $in: ["starting", "checking", "running"] }
    },
    {
      $set: { status: "stopped", containerId: "", errorMessage },
      $push: { logs: { $each: [logLine], $slice: -500 } }
    },
    { new: true }
  );
}

function findInternal(id) {
  return Deployment.findById(id).select("status +runToken").lean();
}

function findByRunToken(id, runToken) {
  return Deployment.findOne({ _id: id, runToken }).select("status").lean();
}

function updateRun(id, runToken, update) {
  return Deployment.findOneAndUpdate(
    { _id: id, runToken, status: { $in: ACTIVE_STATUSES } },
    update,
    { new: true }
  );
}

function findActive(projectName, branchName) {
  return Deployment.findOne({
    projectName,
    branchName,
    status: { $in: ACTIVE_STATUSES }
  });
}

function list() {
  return Deployment.find().sort({ createdAt: -1 }).limit(100).lean();
}

function listActive() {
  return Deployment.find({
    status: { $in: ACTIVE_STATUSES }
  }).sort({ createdAt: -1 });
}

function findById(id) {
  return Deployment.findById(id);
}

function findUsedPorts() {
  return Deployment.find({ status: { $in: ACTIVE_STATUSES } }, "hostPort").lean();
}

function countActiveByImage(imageTag, excludeId) {
  return Deployment.countDocuments({
    imageTag,
    _id: { $ne: excludeId },
    status: { $in: ACTIVE_STATUSES }
  });
}

function countActiveByProject(projectName) {
  return Deployment.countDocuments({
    projectName,
    status: { $in: ACTIVE_STATUSES }
  });
}

function createDeployment(data) {
  return Deployment.create(data);
}

function listPendingCleanup() {
  return Deployment.find({ status: { $in: ["failed", "stopped"] } })
    .sort({ updatedAt: 1 })
    .limit(50);
}

module.exports = {
  Deployment,
  findActive,
  list,
  listActive,
  findById,
  findInternal,
  markContainerStopped,
  markFailedWithoutContainer,
  findByRunToken,
  updateRun,
  findUsedPorts,
  countActiveByImage,
  countActiveByProject,
  createDeployment,
  listPendingCleanup
};
