const {
  assessRisk,
} = require("../../services/assessment/risk_assessment_service");
const {
  buildLoanTerms,
} = require("../../services/assessment/loan_terms_service");
const {
  calculateBaseScore,
} = require("../../services/assessment/scoring_service");
const {
  saveAssessment,
} = require("../../services/assessment/assessment_persistence_service");

function normalizeInput(body) {
  return {
    clientId: body.id ? String(body.id).trim() : null,
    clientCreatedAt: body.createdAt ? new Date(body.createdAt) : null,
    fullName: body.fullName?.trim() || null,
    phone: body.phone?.trim() || null,
    location: body.location || body.province || null,
    province: body.province || null,
    district: body.district || null,
    farmSize: Number(body.farmSize) || null,
    crops: body.crops ? String(body.crops).trim() : null,
    monthlyIncome: Number(body.monthlyIncome),
    monthlyDebtPayment: Number(body.monthlyDebtPayment),
    businessYears: Number(body.businessYears),
    seasonalIncome: Number(body.seasonalIncome) > 0,
    repaymentHistory: String(body.repaymentHistory || "").toLowerCase(),
    hasCollateral: Number(body.farmSize) > 0,
    isFpoMember: Boolean(body.isFpoMember),
    fpoName: body.fpoName || null,
    fpoRole: body.fpoRole || null,
    fpoTrackRecord: body.fpoTrackRecord || null,
  };
}

function validateInput(input) {
  const required = [
    "repaymentHistory",
    "monthlyIncome",
    "monthlyDebtPayment",
    "businessYears",
    // "hasCollateral",
  ];
  for (const key of required) {
    if (
      input[key] === undefined ||
      input[key] === null ||
      (key !== "hasCollateral" && input[key] === "")
    ) {
      const err = new Error(`Missing required field: ${key}`);
      err.statusCode = 400;
      throw err;
    }
  }

  const rh = String(input.repaymentHistory || "").toLowerCase();
  const allowed = new Set(["excellent", "good", "fair", "poor", "none"]);
  if (!allowed.has(rh)) {
    const err = new Error(
      `repaymentHistory must be one of: ${Array.from(allowed).join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(input.monthlyIncome) || input.monthlyIncome <= 0) {
    const err = new Error("monthlyIncome must be a positive number");
    err.statusCode = 400;
    throw err;
  }

  if (
    !Number.isFinite(input.monthlyDebtPayment) ||
    input.monthlyDebtPayment < 0
  ) {
    const err = new Error("monthlyDebtPayment must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(input.businessYears) || input.businessYears < 0) {
    const err = new Error("businessYears must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function computeFpoBoost(isFpoMember, fpoTrackRecord) {
  if (!isFpoMember) return 0;

  switch (String(fpoTrackRecord || "").toLowerCase()) {
    case "good":
      return 10;
    case "new":
      return 5;
    case "bad":
      return 0;
    default:
      return 5;
  }
}

async function assess(req, res) {
  const startedAt = Date.now();

  const input = normalizeInput(req.body || {});
  validateInput(input);

  // Hard timeout toàn request để giữ <10s (AI sẽ fallback nếu bị rate-limit)
  const hardTimeoutMs = 9500;

  let riskResult;

  try {
    riskResult = await Promise.race([
      assessRisk(input),
      new Promise((_, reject) =>
        setTimeout(() => {
          const e = new Error("Assessment timeout");
          e.statusCode = 504;
          reject(e);
        }, hardTimeoutMs)
      ),
    ]);
  } catch (e) {
    // ✅ Timeout -> trả kết quả fallback (base + FPO), không fail request
    if (e?.statusCode === 504) {
      const base = calculateBaseScore(input);
      const fpoBoost = computeFpoBoost(
        Boolean(input.isFpoMember),
        input.fpoTrackRecord
      );

      const rawFinal = base.total + fpoBoost;
      const finalScore = clamp(rawFinal, 0, 100);

      const riskCategory =
        finalScore >= 75
          ? "Low Risk"
          : finalScore >= 50
          ? "Medium Risk"
          : "High Risk";

      riskResult = {
        baseScore: base.total,
        baseBreakdown: base.breakdown,
        aiAdjustment: 0,
        aiReasoning: ["AI timeout; adjustment set to 0."],
        aiSignals: { riskSignals: [], positiveSignals: [] },
        fpoBoost,
        rawFinalScore: rawFinal,
        finalScore,
        riskCategory,
        meta: { aiFallback: true, timeoutFallback: true },
      };
    } else {
      throw e;
    }
  }

  const loanTerms = buildLoanTerms(input, riskResult);
  const latencyMs = Date.now() - startedAt;

  let assessmentId = null;
  try {
    assessmentId = await saveAssessment({
      input,
      result: riskResult,
      loanTerms,
      meta: { latencyMs },
    });
  } catch (e) {
    console.error("[DB] saveAssessment failed:", e?.message || e);
  }

  res.status(200).json({
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

    loanTerms,

    decisionReasons: buildDecisionReasons(riskResult, input),

    explainable: {
      base: "Base score computed from transparent financial & farming factors.",
      finalFormula: "final = base + aiAdjustment + fpoBoost (0..100)",
    },
    meta: {
      latencyMs,
    },
  });
}

function buildDecisionReasons(result, input) {
  const reasons = [];

  if (result.baseBreakdown.debtToIncome >= 26) {
    reasons.push("LOW_DEBT_TO_INCOME");
  }

  if (["excellent", "good"].includes(input.repaymentHistory)) {
    reasons.push("GOOD_REPAYMENT_HISTORY");
  }

  if (
    input.isFpoMember &&
    String(input.fpoTrackRecord).toLowerCase() === "good"
  ) {
    reasons.push("GOOD_FPO_TRACK_RECORD");
  }

  if (result.finalScore >= 75) {
    reasons.push("LOW_RISK_SCORE");
  }

  return reasons;
}

module.exports = { assess };
