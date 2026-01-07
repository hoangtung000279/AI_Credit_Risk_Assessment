const {
  insertAssessment,
} = require("../repositories/assessment/assessment_repo");
const { buildAnalytics } = require("./analytics_builder");
const { getState } = require("../repositories/ai_model/ai_model_repo");
const aiLearning = require("./ai/ai_learning_service");
const { getDb } = require("../config/db/mongo_client");

function toDateOrNow(v) {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function pickFirstCrop(input) {
  const crops = input?.crops;
  if (Array.isArray(crops) && crops.length > 0) return String(crops[0]);
  if (typeof crops === "string" && crops.trim()) return String(crops);
  return null;
}

function buildAiModelSnapshot(state, result) {
  return {
    // giữ backward-compatible: vẫn ưu tiên model cố định nếu bạn muốn
    model: result?.meta?.aiModel?.model ?? "gemini-2.5-flash",
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

  // ✅ add crop for BE-301 training patterns (safe-add field, không ảnh hưởng BE cũ)
  analytics.crop = analytics.crop ?? pickFirstCrop(input);

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
      aiSignalsistr: result.aiSignals,
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

  // 3) bump trainedOn (BE-203) - ✅ thông qua aiLearning để cache đồng bộ
  let stateAfter = null;
  try {
    stateAfter = await aiLearning.onAssessmentSaved();
  } catch (e) {
    console.warn("[MODEL] onAssessmentSaved failed:", e?.message || e);
  }

  if (!stateAfter) {
    // fallback nếu onAssessmentSaved fail
    stateAfter = await getState();
  }

  const aiModelSnapshot = buildAiModelSnapshot(stateAfter, result);

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
          // giữ field aiModel snapshot cho dashboard/debug
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
