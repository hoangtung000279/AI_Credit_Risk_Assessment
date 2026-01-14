const assessmentRepo = require("../assessment/assessment_repo");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toIso(date) {
  try {
    return date ? new Date(date).toISOString() : "";
  } catch {
    return "";
  }
}

function pickExportRow(doc) {
  const input = doc.input || doc.farmerData || {};
  const scores = doc.scores || doc.result || {};

  const loanTerms =
    doc.loanTerms || scores.loanTerms || doc.result?.loanTerms || null;
  const loanTermsWithout =
    doc.loanTermsWithout ||
    scores.loanTermsWithout ||
    doc.result?.loanTermsWithout ||
    null;

  const baseBreakdown =
    scores.baseBreakdown ||
    scores.breakdown ||
    doc.result?.baseBreakdown ||
    doc.result?.breakdown ||
    null;

  return {
    id: input.clientId ?? doc.clientId ?? null,
    assessmentId: doc._id?.toString?.() || "",
    createdAt: toIso(doc.createdAt),

    summary: {
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
      location: input.location ?? doc.location ?? null,
      province: input.province ?? null,
      district: input.district ?? null,
      farmSize: input.farmSize ?? null,
      crops: input.crops ?? null,
      monthlyIncome: input.monthlyIncome ?? null,
      monthlyDebtPayment: input.monthlyDebtPayment ?? null,
      businessYears: input.businessYears ?? null,
      seasonalIncome: input.seasonalIncome ?? null,
      isFpoMember: Boolean(input.isFpoMember),
      fpoName: input.fpoName ?? null,
      fpoRole: input.fpoRole ?? null,
      fpoTrackRecord: input.fpoTrackRecord ?? null,
    },

    score: {
      baseScore: scores.baseScore ?? null,
      finalScore: scores.finalScore ?? doc.finalScore ?? null,
      riskCategory: scores.riskCategory ?? doc.riskCategory ?? null,
      fpoBoost:
        scores.fpoBoost ?? scores.fpoBoost === 0 ? scores.fpoBoost : null,
      aiAdjustment: scores.aiAdjustment ?? 0,
    },

    breakdown: baseBreakdown,

    loanTerms: loanTerms
      ? {
          recommendedAmount: loanTerms.recommendedAmount ?? null,
          interestRateAnnual: loanTerms.interestRateAnnual ?? null,
          tenureMonths: loanTerms.tenureMonths ?? null,
          estimatedMonthlyPayment: loanTerms.estimatedMonthlyPayment ?? null,
          paymentCap: loanTerms.paymentCap ?? null,
        }
      : null,

    loanTermsWithout: loanTermsWithout
      ? {
          recommendedAmount: loanTermsWithout.recommendedAmount ?? null,
          interestRateAnnual: loanTermsWithout.interestRateAnnual ?? null,
          tenureMonths: loanTermsWithout.tenureMonths ?? null,
          estimatedMonthlyPayment:
            loanTermsWithout.estimatedMonthlyPayment ?? null,
          paymentCap: loanTermsWithout.paymentCap ?? null,
        }
      : null,
  };
}

/**
 * CSV Export (default)
 * GET /api/admin/export
 * Optional: /api/admin/export?from=...&to=...
 */
async function exportAssessmentsCsv(res, { from, to } = {}) {
  // ✅ tạo cursor trước để nếu lỗi thì middleware trả JSON (chưa send headers)
  const cursor = assessmentRepo.cursorForExport({ from, to });

  const fileName = `assessments_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Cache-Control", "no-store");

  // BOM để Excel mở tiếng Việt/UTF-8 không lỗi
  res.write("\ufeff");

  const headers = [
    "assessmentId",
    "createdAt",
    "location",
    "isFpoMember",
    "fpoTrackRecord",
    "baseScore",
    "aiAdjustment",
    "fpoBoost",
    "finalScore",
    "riskCategory",
  ];

  res.write(headers.join(",") + "\n");

  try {
    for await (const doc of cursor) {
      const row = pickExportRow(doc);
      const line = headers.map((h) => csvEscape(row[h])).join(",") + "\n";
      res.write(line);
    }
  } finally {
    res.end();
  }
}

/**
 * JSON Export (object like BE-106)
 * GET /api/admin/export?format=json
 * Optional: /api/admin/export?format=json&from=...&to=...
 */
async function exportAssessmentsJson(res, { from, to } = {}) {
  const startedAt = Date.now();

  const cursor = assessmentRepo.cursorForExport({ from, to });

  const data = [];
  for await (const doc of cursor) {
    data.push(pickExportRow(doc)); // reuse row mapping (anonymized)
  }

  res.status(200).json({
    ok: true,
    totalAssessments: data.length,
    data,
    meta: {
      collection: "assessments",
      format: "json",
      anonymized: true,
      latencyMs: Date.now() - startedAt,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
  });
}

module.exports = { exportAssessmentsCsv, exportAssessmentsJson };
