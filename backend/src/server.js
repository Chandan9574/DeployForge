require("dotenv").config();

const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");
const { reconcileDeployments } = require("./services/deploymentService");

async function start() {
  await connectDatabase();
  await reconcileDeployments();
  app.listen(env.PORT, () => {
    console.log(`DeployForge API listening on http://localhost:${env.PORT}`);
  });
}

start().catch((error) => {
  console.error("Could not start DeployForge:", error.message);
  process.exit(1);
});
