const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const controller = require("../controllers/deploymentController");

const router = express.Router();
router.get("/", asyncHandler(controller.list));
router.post("/", asyncHandler(controller.create));
router.get("/:id", asyncHandler(controller.getOne));
router.get("/:id/stats", asyncHandler(controller.stats));
router.get("/:id/logs", asyncHandler(controller.logs));
router.delete("/:id", asyncHandler(controller.remove));

module.exports = router;
