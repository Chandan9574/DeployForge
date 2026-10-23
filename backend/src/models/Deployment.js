const mongoose = require("mongoose");

const deploymentSchema = new mongoose.Schema(
  {
    projectName: { type: String, required: true, trim: true, maxlength: 60 },
    repositoryUrl: { type: String, default: "", maxlength: 500 },
    branchName: { type: String, required: true, trim: true, maxlength: 100 },
    commitSha: { type: String, default: "", maxlength: 64 },
    containerId: { type: String, default: "", maxlength: 128 },
    containerName: { type: String, required: true, maxlength: 128 },
    hostPort: { type: Number, required: true, min: 1024, max: 65535 },
    containerPort: { type: Number, required: true, min: 1, max: 65535 },
    previewUrl: { type: String, required: true, maxlength: 300 },
    status: { type: String, enum: ["pending", "building", "starting", "running", "failed", "stopped"], default: "pending" },
    errorMessage: { type: String, default: "", maxlength: 1000 },
    logs: { type: [String], default: [], validate: [(logs) => logs.length <= 200, "Too many log entries"] }
  },
  { timestamps: true }
);

deploymentSchema.index({ projectName: 1, branchName: 1 });
deploymentSchema.index(
  { hostPort: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "building", "starting", "running"] }
    }
  }
);

module.exports = mongoose.model("Deployment", deploymentSchema);
