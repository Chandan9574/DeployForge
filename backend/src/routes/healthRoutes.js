const express = require("express");

const router = express.Router();
router.get("/", (request, response) => response.json({ status: "ok", service: "deployforge-api" }));

module.exports = router;
