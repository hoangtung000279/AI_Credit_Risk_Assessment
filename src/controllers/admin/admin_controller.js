const { getAdminStats } = require("../../services/admin/admin_stats_service");
const adminExportService = require("../../services/admin/admin_export_service");

function parseDateOrNull(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/admin/stats?from=2025-12-01&to=2025-12-31
async function stats(req, res) {
  const startedAt = Date.now();

  const from = parseDateOrNull(req.query.from);
  const to = parseDateOrNull(req.query.to);

  const data = await getAdminStats({ from, to });

  res.status(200).json({
    ok: true,
    ...data,
    meta: {
      ...(data.meta || {}),
      latencyMs: Date.now() - startedAt,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
  });
}

// GET /api/admin/export?format=csv|json&from=...&to=...
async function exportData(req, res) {
  const format = String(req.query.format || "csv").toLowerCase();
  const from = parseDateOrNull(req.query.from);
  const to = parseDateOrNull(req.query.to);

  if (format === "json") {
    return adminExportService.exportAssessmentsJson(res, { from, to });
  }

  // default CSV
  return adminExportService.exportAssessmentsCsv(res, { from, to });
}

module.exports = { stats, exportData };
