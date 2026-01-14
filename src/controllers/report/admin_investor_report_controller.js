const {
  generateInvestorReportPdf,
} = require("../../services/report/investor_report/investor_report_service");
const { adminExportKey } = require("../../config/env");

function readAdminKey(req) {
  return req.header("x-admin-key") || req.query.key;
}

function latencyMs(req, startedAtFallback) {
  const startedAt = req._startedAt ?? startedAtFallback ?? Date.now();
  return Date.now() - startedAt;
}

function meta(req, startedAtFallback) {
  return {
    requestId: req.id || req.header("x-request-id") || null,
    latencyMs: latencyMs(req, startedAtFallback),
  };
}

function ensureAdmin(req, res, startedAt) {
  const key = readAdminKey(req);
  if (!adminExportKey || !key || key !== adminExportKey) {
    res.status(401).json({
      ok: false,
      message: "Unauthorized",
      meta: meta(req, startedAt),
    });
    return false;
  }
  return true;
}

function parseDateQuery(v, { endOfDay = false } = {}) {
  if (v == null || v === "") return { ok: true, value: undefined };

  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return { ok: false, value: undefined };

  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);

  return { ok: true, value: d };
}

// GET /api/admin/investor-report?from=2026-01-01&to=2026-01-31
async function investorReport(req, res) {
  const startedAt = Date.now();
  if (!ensureAdmin(req, res, startedAt)) return;

  const fromParsed = parseDateQuery(req.query.from);
  const toParsed = parseDateQuery(req.query.to, { endOfDay: true });

  if (!fromParsed.ok || !toParsed.ok) {
    return res.status(400).json({
      ok: false,
      message: "Invalid date format. Use YYYY-MM-DD (e.g. 2026-01-01).",
      meta: meta(req, startedAt),
    });
  }

  if (fromParsed.value && toParsed.value && fromParsed.value > toParsed.value) {
    return res.status(400).json({
      ok: false,
      message: "`from` must be <= `to`.",
      meta: meta(req, startedAt),
    });
  }

  const { doc } = await generateInvestorReportPdf({
    from: fromParsed.value,
    to: toParsed.value,
  });

  // Nếu client đã disconnect trong lúc build PDF
  if (req.aborted || res.writableEnded) {
    try {
      doc.end();
    } catch {}
    return;
  }

  // Response headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="investor-report-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf"`
  );

  // Handle client cancel / close
  const onClose = () => {
    try {
      doc.end();
    } catch {}
  };
  res.on("close", onClose);

  // Stream PDF
  doc.pipe(res);
  doc.end();
}

module.exports = { investorReport };
