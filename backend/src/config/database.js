const mongoose = require("mongoose");
const env = require("./env");
const Deployment = require("../models/Deployment");

async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI);
  await Deployment.syncIndexes();
  console.log("MongoDB connected");
}

module.exports = { connectDatabase };
