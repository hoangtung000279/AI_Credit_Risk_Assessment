const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const adminController = require("../controllers/admin_controller");

const router = express.Router();

// BE-106
router.get("/stats", asyncHandler(adminController.stats));

// BE-107
router.get("/export", asyncHandler(adminController.exportData));

module.exports = router;
