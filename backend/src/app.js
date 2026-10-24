require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const env = require("./config/env");
const asyncHandler = require("./middleware/asyncHandler");
const deploymentRoutes = require("./routes/deploymentRoutes");
const deploymentController = require("./controllers/deploymentController");
const healthRoutes = require("./routes/healthRoutes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./errors/errorHandler");
const {
  corsMiddleware,
  helmetMiddleware,
  sanitizeBody,
  apiLimiter
} = require("./middleware/security");

const app = express();
app.disable("x-powered-by");
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(apiLimiter);
app.use(express.json({ limit: "100kb" }));
app.use(sanitizeBody);
app.use(morgan("combined"));

app.use("/api/health", healthRoutes);
// Configuration is intentionally public and contains no secrets; clients need
// it before they can create their first deployment.
app.get("/api/config", asyncHandler(deploymentController.config));
app.use("/api/deployments", deploymentRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
