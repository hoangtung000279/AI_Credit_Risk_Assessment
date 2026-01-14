// src/models/assessment/assessment_response_dto.js

function buildDecisionReasons(result, input) {
  const reasons = [];

  if (result?.baseBreakdown?.debtToIncome >= 26)
    reasons.push("LOW_DEBT_TO_INCOME");
  if (["excellent", "good"].includes(input.repaymentHistory))
    reasons.push("GOOD_REPAYMENT_HISTORY");
  if (
    input.isFpoMember &&
    String(input.fpoTrackRecord || "").toLowerCase() === "good"
  )
    reasons.push("GOOD_FPO_TRACK_RECORD");
  if (Number(result.finalScore) >= 75) reasons.push("LOW_RISK_SCORE");

  return reasons;
}

function pickLoanTermsComparable(terms) {
  if (!terms) return null;

  return {
    recommendedAmount: terms.recommendedAmount ?? null,
    interestRateAnnual: terms.interestRateAnnual ?? null,
    tenureMonths: terms.tenureMonths ?? null,
    estimatedMonthlyPayment: terms.estimatedMonthlyPayment ?? null,
    paymentCap: terms.paymentCap ?? null,
  };
}

function buildAssessmentResponse({
  input,
  riskResult,
  loanTerms,
  loanTermsWithout, // ✅ add
  assessmentId,
  latencyMs,
}) {
  return {
    ok: true,
    id: input.clientId,
    createdAt: input.clientCreatedAt ?? new Date().toISOString(),
    assessmentId,

    summary: {
      fullName: input.fullName,
      phone: input.phone,
      location: input.location,
      province: input.province,
      district: input.district,
      farmSize: input.farmSize,
      crops: input.crops,
      monthlyIncome: input.monthlyIncome,
      monthlyDebtPayment: input.monthlyDebtPayment,
      businessYears: input.businessYears,
      seasonalIncome: input.seasonalIncome,
      isFpoMember: input.isFpoMember,
      fpoName: input.fpoName,
      fpoRole: input.fpoRole,
      fpoTrackRecord: input.fpoTrackRecord,
    },

    score: {
      baseScore: riskResult.baseScore,
      finalScore: riskResult.finalScore,
      riskCategory: riskResult.riskCategory,
      fpoBoost: riskResult.fpoBoost,
      aiAdjustment: riskResult.aiAdjustment,
    },

    breakdown: riskResult.baseBreakdown,

    // ✅ show both terms for comparison
    loanTerms: pickLoanTermsComparable(loanTerms),
    loanTermsWithout: pickLoanTermsComparable(loanTermsWithout),

    decisionReasons: buildDecisionReasons(riskResult, input),

    explainable: {
      base: "Base score computed from transparent financial & farming factors.",
      finalFormula: "final = base + aiAdjustment + fpoBoost (0..100)",
    },

    meta: { latencyMs },
  };
}

module.exports = { buildAssessmentResponse, buildDecisionReasons };
