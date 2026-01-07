const {
  getAnalyticsSummary,
} = require("../../services/analytics/analytics_service");

function parseDateOrNull(v) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function summary(req, res) {
  const startedAt = Date.now();
  const from = parseDateOrNull(req.query.from);
  const to = parseDateOrNull(req.query.to);

  const data = await getAnalyticsSummary({ from, to });

  res.status(200).json({
    ok: true,
    ...data,
    meta: {
      latencyMs: Date.now() - startedAt,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
  });
}

module.exports = { summary };
