const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const validateAssess = require("../middleware/validate_assess");
const assessmentController = require("../controllers/assessment/assessment_controller");

const router = express.Router();

router.post(
  "/assess",
  validateAssess,
  asyncHandler(assessmentController.assess)
);

module.exports = router;
