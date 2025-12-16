const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const aiController = require("../controllers/ai_controller");

const router = express.Router();
router.post("/ping", asyncHandler(aiController.ping));

module.exports = router;
