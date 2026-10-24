const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const agent37Auth = require("../middleware/agent37Auth");
const controller = require("../controllers/agent37Controller");

const router = express.Router();
router.use(agent37Auth);

router.get("/instances", asyncHandler(controller.list));
router.post("/instances", asyncHandler(controller.create));
router.get("/instances/:id", asyncHandler(controller.getOne));
router.post("/instances/:id/exec", asyncHandler(controller.exec));
router.post("/instances/:id/messages", asyncHandler(controller.message));
router.post("/instances/:id/public-ports", asyncHandler(controller.createPublicPort));
router.get("/instances/:id/public-ports", asyncHandler(controller.listPublicPorts));
router.delete("/instances/:id/public-ports/:port", asyncHandler(controller.deletePublicPort));
router.delete("/instances/:id", asyncHandler(controller.remove));

module.exports = router;
