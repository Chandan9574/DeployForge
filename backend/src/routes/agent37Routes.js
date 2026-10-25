const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const apiAuth = require("../middleware/apiAuth");
const controller = require("../controllers/agent37Controller");

const router = express.Router();
router.get("/configuration", asyncHandler(controller.status));
router.post("/configuration", apiAuth, asyncHandler(controller.configure));

module.exports = router;
