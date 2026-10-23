const mongoose = require("mongoose");
const AppError = require("../errors/AppError");

function validateObjectId(value) {
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError("Invalid deployment id", 400, "INVALID_ID");
  }
  return value;
}

module.exports = validateObjectId;
