const { insertAssessment } = require("../repositories/assessment_repo");

async function saveAssessment({ input, result, loanTerms, meta }) {
  const doc = {
    farmerData: input, // raw input sau normalize
    scores: {
      baseScore: result.baseScore,
      aiAdjustment: result.aiAdjustment,
      fpoBoost: result.fpoBoost,
      rawFinalScore: result.rawFinalScore,
      finalScore: result.finalScore,
      riskCategory: result.riskCategory,
      baseBreakdown: result.baseBreakdown,
    },
    reasoning: {
      aiReasoning: result.aiReasoning,
      aiSignals: result.aiSignals,
    },
    loanTerms,
    location: input.location ?? null,
    createdAt: new Date(),
    meta: {
      latencyMs: meta?.latencyMs ?? null,
      aiFallback: Boolean(result?.meta?.aiFallback),
      timeoutFallback: Boolean(result?.meta?.timeoutFallback),
    },
    version: 1,
  };

  const id = await insertAssessment(doc);
  return id.toString();
}

module.exports = { saveAssessment };
