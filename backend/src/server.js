require("dotenv").config();

const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");

async function start() {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.log(`DeployForge API listening on http://localhost:${env.PORT}`);
  });
}

start().catch((error) => {
  console.error("Could not start DeployForge:", error.message);
  process.exit(1);
});
