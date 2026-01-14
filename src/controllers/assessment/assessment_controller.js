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

const {
  normalizeAssessmentRequest,
} = require("../assessment/models/assessment_request_dto");
const {
  validateAssessmentRequest,
} = require("../assessment/models/assessment_validation");
const {
  buildAssessmentResponse,
} = require("../assessment/models/assessment_response_dto");

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
  const input = normalizeAssessmentRequest(req.body || {});
  validateAssessmentRequest(input);

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

  return res.status(200).json(
    buildAssessmentResponse({
      input,
      riskResult,
      loanTerms,
      assessmentId,
      latencyMs,
    })
  );
}

module.exports = { assess };
