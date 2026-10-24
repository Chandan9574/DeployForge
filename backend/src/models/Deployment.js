const mongoose = require("mongoose");
const { ACTIVE_STATUSES } = require("../constants");

const deploymentSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true, trim: true, maxlength: 60 },
    repositoryUrl: { type: String, default: "", maxlength: 500 },
    branchName: { type: String, required: true, trim: true, maxlength: 100 },
    commitSha: { type: String, default: "", maxlength: 64 },
    deploymentMode: { type: String, enum: ["dockerfile", "image"], default: "dockerfile" },
    dockerfilePath: { type: String, default: "Dockerfile", maxlength: 200 },
    buildContext: { type: String, default: ".", maxlength: 200 },
    imageTag: { type: String, default: "", maxlength: 200 },
    containerId: { type: String, default: "", maxlength: 128 },
    containerName: { type: String, required: true, maxlength: 128 },
    hostPort: { type: Number, required: true, min: 1024, max: 65535 },
    containerPort: { type: Number, required: true, min: 1, max: 65535, default: 80 },
    healthcheckPath: { type: String, default: "/", maxlength: 200 },
    previewUrl: { type: String, required: true, maxlength: 300 },
    runToken: { type: String, default: "", select: false },
    status: {
      type: String,
      enum: [...ACTIVE_STATUSES, "failed", "stopped"],
      default: "pending"
    },
    errorMessage: { type: String, default: "", maxlength: 1000 },
    startedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0, min: 0 },
    logs: { type: [String], default: [], validate: [(logs) => logs.length <= 500, "Too many log entries"] }
  },
  { timestamps: true }
);

deploymentSchema.index({ projectName: 1, branchName: 1 });
deploymentSchema.index(
  { projectName: 1, branchName: 1 },
  {
    unique: true,
    name: "one_active_preview_per_branch",
    partialFilterExpression: { status: { $in: ACTIVE_STATUSES } }
  }
);
deploymentSchema.index(
  { previewUrl: 1 },
  {
    unique: true,
    name: "one_active_preview_per_host",
    partialFilterExpression: { status: { $in: ACTIVE_STATUSES } }
  }
);
deploymentSchema.index(
  { hostPort: 1 },
  {
    unique: true,
    name: "one_active_preview_per_port",
    partialFilterExpression: { status: { $in: ACTIVE_STATUSES } }
  }
);

module.exports = mongoose.model("Deployment", deploymentSchema);
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
