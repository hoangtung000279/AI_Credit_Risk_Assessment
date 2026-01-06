const {
  generateInvestorReportPdf,
} = require("../../services/report/investor_report_service");

const { adminExportKey } = require("../../config/env");

function readAdminKey(req) {
  return req.header("x-admin-key") || req.query.key;
}

function ensureAdmin(req, res, startedAt) {
  const key = readAdminKey(req);
  if (!adminExportKey || key !== adminExportKey) {
    res.status(401).json({
      ok: false,
      message: "Unauthorized",
      meta: { latencyMs: Date.now() - startedAt },
    });
    return false;
  }
  return true;
}

// GET /api/admin/investor-report?from=2026-01-01&to=2026-01-31
async function investorReport(req, res) {
  const startedAt = Date.now();
  if (!ensureAdmin(req, res, startedAt)) return;

  const { from, to } = req.query;

  const fromDate = from ? new Date(String(from)) : null;
  const toDate = to ? new Date(String(to)) : null;

  const { doc } = await generateInvestorReportPdf({
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="investor-report-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf"`
  );

  // stream
  doc.pipe(res);
  doc.end();
}

module.exports = { investorReport };
