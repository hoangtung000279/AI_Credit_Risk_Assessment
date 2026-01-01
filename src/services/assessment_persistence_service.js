const { insertAssessment } = require("../repositories/assessment_repo");
const { buildAnalytics } = require("./analytics_builder");
const { bumpTrainedOn, getState } = require("../repositories/ai_model_repo");
const { getDb } = require("../config/mongo_client");

function toDateOrNow(v) {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function buildAiModelSnapshot(state) {
  return {
    model: "gemini-2.5-flash",
    modelVersion: state?.modelVersion ?? 1,
    trainedOnSnapshot: state?.trainedOn ?? 0,
    adjustmentRange: {
      min: state?.adjustmentMin ?? -5,
      max: state?.adjustmentMax ?? 15,
    },
    trainedAt: state?.trainedAt ?? null,
    trainedOnAtTraining: state?.trainedOnAtTraining ?? 0,
  };
}

async function saveAssessment({ input, result, loanTerms, meta }) {
  // 1) analytics base (BE-201)
  const analytics = { ...buildAnalytics({ input, result, meta }) };

  analytics.createdAt = toDateOrNow(analytics.createdAt ?? new Date());
  analytics.location =
    analytics.location ??
    input?.location ??
    input?.farmerData?.location ??
    null;

  // 2) insert assessment trước (đảm bảo “save every assessment”)
  const doc = {
    farmerData: input,
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
    location: analytics.location,
    createdAt: analytics.createdAt,
    meta: {
      latencyMs: meta?.latencyMs ?? null,
      aiFallback: Boolean(result?.meta?.aiFallback),
      timeoutFallback: Boolean(result?.meta?.timeoutFallback),
    },
    analytics,
    version: 3,
  };

  const insertedId = await insertAssessment(doc);

  // 3) bump trainedOn (BE-203)
  let stateAfter = await bumpTrainedOn();
  if (!stateAfter) {
    // fallback nếu bump trả null vì lý do driver/upsert
    stateAfter = await getState();
  }

  const aiModelSnapshot = buildAiModelSnapshot(stateAfter);

  // 4) update lại doc vừa insert để lưu snapshot model (không bắt buộc nhưng đúng BE-203)
  try {
    const db = getDb();
    await db.collection("assessments").updateOne(
      { _id: insertedId },
      {
        $set: {
          "analytics.model": aiModelSnapshot.model,
          "analytics.modelVersion": aiModelSnapshot.modelVersion,
          "analytics.trainedOn": aiModelSnapshot.trainedOnSnapshot,
          "analytics.adjustmentMin": aiModelSnapshot.adjustmentRange.min,
          "analytics.adjustmentMax": aiModelSnapshot.adjustmentRange.max,
          "analytics.trainedAt": aiModelSnapshot.trainedAt,
          "analytics.trainedOnAtTraining": aiModelSnapshot.trainedOnAtTraining,
          aiModel: aiModelSnapshot,
        },
      }
    );
  } catch (e) {
    // MVP: không để fail request chỉ vì update snapshot
    console.warn("[MODEL] snapshot update failed:", e?.message || e);
  }

  return insertedId.toString();
}

module.exports = { saveAssessment };
