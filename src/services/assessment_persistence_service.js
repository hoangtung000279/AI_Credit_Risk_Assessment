const { insertAssessment } = require("../repositories/assessment_repo");
const { buildAnalytics } = require("./analytics_builder");

async function saveAssessment({ input, result, loanTerms, meta }) {
  const analytics = buildAnalytics({ input, result, meta });

  const doc = {
    farmerData: input, // raw input sau normalize (MVP ok)
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

    // ✅ đồng bộ với analytics để query dễ
    location: analytics.location,
    createdAt: analytics.createdAt,

    meta: {
      latencyMs: meta?.latencyMs ?? null,
      aiFallback: Boolean(result?.meta?.aiFallback),
      timeoutFallback: Boolean(result?.meta?.timeoutFallback),
    },

    // ✅ BE-201: log/derived fields cho analytics query nhanh
    analytics,

    version: 2,
  };

  const id = await insertAssessment(doc);
  return id.toString();
}

module.exports = { saveAssessment };
