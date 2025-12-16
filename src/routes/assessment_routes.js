const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const assessmentController = require("../controllers/assessment_controller");

const router = express.Router();

router.post("/assess", asyncHandler(assessmentController.assess));

module.exports = router;
