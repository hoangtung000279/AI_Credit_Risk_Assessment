const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const adminController = require("../controllers/admin_controller");
const adminAnalyticsController = require("../controllers/admin_analytics_controller");
const adminDashboardController = require("../controllers/admin_dashboard_controller");
const adminModelController = require("../controllers/admin_model_controller");
const adminBackupController = require("../controllers/admin_backup_controller");
const adminInvestorReportController = require("../controllers/report/admin_investor_report_controller");

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

// BE-203
router.get("/model/status", asyncHandler(adminModelController.status));

// BE-205
router.post("/backup/run", asyncHandler(adminBackupController.run));
router.get("/backup/status", asyncHandler(adminBackupController.status));
router.get("/backup/list", asyncHandler(adminBackupController.list));

// BE-301
router.post("/model/train", asyncHandler(adminModelController.train));
router.get("/model/history", asyncHandler(adminModelController.history));

// BE-302
router.get(
  "/investor-report",
  asyncHandler(adminInvestorReportController.investorReport)
);

module.exports = router;
