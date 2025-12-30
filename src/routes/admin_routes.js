const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const adminController = require("../controllers/admin_controller");
const adminAnalyticsController = require("../controllers/admin_analytics_controller");
const adminDashboardController = require("../controllers/admin_dashboard_controller");

const router = express.Router();

// BE-106
router.get("/stats", asyncHandler(adminController.stats));

// BE-107
router.get("/export", asyncHandler(adminController.exportData));

// BE-201
router.get(
  "/analytics/summary",
  asyncHandler(adminAnalyticsController.summary)
);

// BE-202
router.get("/dashboard", asyncHandler(adminDashboardController.dashboard));

module.exports = router;
