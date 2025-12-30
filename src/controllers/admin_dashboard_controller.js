const { getAdminDashboard } = require("../services/admin_dashboard_service");

function parseDateOrNull(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/admin/dashboard?from=2025-12-01&to=2025-12-31
async function dashboard(req, res) {
  const startedAt = Date.now();

  const from = parseDateOrNull(req.query.from);
  const to = parseDateOrNull(req.query.to);

  const data = await getAdminDashboard({ from, to });

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

module.exports = { dashboard };
