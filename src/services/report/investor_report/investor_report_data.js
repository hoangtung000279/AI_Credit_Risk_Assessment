// const assessmentRepo = require("../../repositories/assessment/assessment_repo");
const assessmentRepo = require("../../../repositories/assessment/assessment_repo");
const {
  asNum,
  parseDateParam,
  normalizeDayKey,
  buildLastNDaysSeries,
} = require("../pdf/pdf_helpers");

async function buildInvestorReportData({ from, to } = {}) {
  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to, { endOfDay: true });

  const match =
    fromDate || toDate
      ? assessmentRepo.buildMatch({ from: fromDate, to: toDate })
      : {};

  const stats = await assessmentRepo.aggregateStats({ match });
  const dashboard = await assessmentRepo.aggregateDashboard({
    from: fromDate,
    to: toDate,
  });

  const total = asNum(stats?.totalAssessments, 0);

  const byProvince = Array.isArray(stats?.byProvince) ? stats.byProvince : [];
  const topGeo = byProvince.slice(0, 12);

  const risk = stats?.riskDistribution ?? {
    low: 0,
    medium: 0,
    high: 0,
    unknown: 0,
  };

  const fpoRows = Array.isArray(dashboard?.byFpo) ? dashboard.byFpo : [];
  const fpoMember = fpoRows.find((x) => x._id === "member");
  const fpoNon = fpoRows.find((x) => x._id === "non_member");

  const fpoImpact = {
    member: {
      count: asNum(fpoMember?.count, 0),
      avgFinalScore: asNum(fpoMember?.avgFinalScore, 0),
    },
    nonMember: {
      count: asNum(fpoNon?.count, 0),
      avgFinalScore: asNum(fpoNon?.avgFinalScore, 0),
    },
  };

  const byDay = Array.isArray(dashboard?.byDay) ? dashboard.byDay : [];
  const growth = buildLastNDaysSeries(byDay, {
    days: 30,
    to: toDate ?? new Date(),
  });

  const dateRange = {
    from: fromDate ? normalizeDayKey(fromDate) : growth[0]?.day ?? null,
    to: toDate
      ? normalizeDayKey(toDate)
      : growth[growth.length - 1]?.day ?? null,
  };

  return {
    generatedAt: new Date().toISOString(),
    total,
    dateRange,
    geo: topGeo,
    risk,
    fpoImpact,
    growth,
  };
}

module.exports = { buildInvestorReportData };
