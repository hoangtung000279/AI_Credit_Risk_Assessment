const { assessRisk } = require("../services/risk_assessment_service");
const { buildLoanTerms } = require("../services/loan_terms_service");
const { calculateBaseScore } = require("../services/scoring_service");
const {
  saveAssessment,
} = require("../services/assessment_persistence_service");

function normalizeInput(body) {
  return {
    ...body,
    monthlyIncome: Number(body.monthlyIncome),
    monthlyDebtPayment: Number(body.monthlyDebtPayment),
    businessYears: Number(body.businessYears),
    hasCollateral: Boolean(body.hasCollateral),
    isFpoMember: Boolean(body.isFpoMember),
    crops: Array.isArray(body.crops)
      ? body.crops.map(String)
      : body.crops
      ? [String(body.crops)]
      : [],
  };
}

function validateInput(input) {
  const required = [
    "repaymentHistory",
    "monthlyIncome",
    "monthlyDebtPayment",
    "businessYears",
    "hasCollateral",
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
    assessmentId,
    ...riskResult,
    loanTerms,
    explainable: {
      base: "Base score computed from 5 transparent factors.",
      finalFormula: "final = base + aiAdjustment + fpoBoost (capped 0..100)",
      loanTerms: "Terms derived from finalScore + payment capacity cap.",
    },
    meta: {
      ...(riskResult?.meta || {}),
      latencyMs,
    },
  });
}

module.exports = { assess };
