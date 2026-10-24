require("dotenv").config();

const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");
const { reconcileDeployments } = require("./services/deploymentService");

async function start() {
  await connectDatabase();
  await reconcileDeployments();
  app.listen(env.PORT, (error) => {
    if (error) {
      console.error(`Could not listen on port ${env.PORT}:`, error.message);
      process.exit(1);
    }
    console.log(`DeployForge API listening on http://localhost:${env.PORT}`);
  });

  const timer = setInterval(() => {
    reconcileDeployments().catch((error) => console.error("Reconciliation failed:", error.message));
  }, 60000);
  timer.unref();
}

start().catch((error) => {
  console.error("Could not start DeployForge:", error.message);
  process.exit(1);
});
