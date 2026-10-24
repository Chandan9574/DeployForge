require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const env = require("./config/env");
const deploymentRoutes = require("./routes/deploymentRoutes");
const agent37Routes = require("./routes/agent37Routes");
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
app.use("/api/deployments", deploymentRoutes);
app.use("/api/agent37", agent37Routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
