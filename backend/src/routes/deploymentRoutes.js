const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const apiAuth = require("../middleware/apiAuth");
const controller = require("../controllers/deploymentController");

const router = express.Router();
router.get("/config", asyncHandler(controller.config));
router.get("/branches", asyncHandler(controller.listBranches));
router.post("/preflight", asyncHandler(controller.preflight));
router.get("/", asyncHandler(controller.list));
router.post("/", apiAuth, asyncHandler(controller.create));
router.get("/:id", asyncHandler(controller.getOne));
router.get("/:id/stats", asyncHandler(controller.stats));
router.get("/:id/logs", asyncHandler(controller.logs));
router.post("/:id/restart", apiAuth, asyncHandler(controller.restart));
router.post("/:id/stop", apiAuth, asyncHandler(controller.stop));
router.delete("/:id", apiAuth, asyncHandler(controller.remove));

module.exports = router;
