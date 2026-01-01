const { TtlCache } = require("../utils/ttl_cache");
const aiModelRepo = require("../repositories/ai_model_repo");
const assessmentRepo = require("../repositories/assessment_repo");

const cache = new TtlCache();
const CACHE_KEY = "ai_model_state";
const STATE_TTL_MS = Number(process.env.MODEL_STATE_TTL_MS || 30000);

let trainingInProgress = false;

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeKey(location, crop) {
  return `${norm(location)}|${norm(crop)}`;
}

async function getStateCached() {
  const hit = cache.get(CACHE_KEY);
  if (hit) return hit;

  const state = await aiModelRepo.getState();
  cache.set(CACHE_KEY, state, STATE_TTL_MS);
  return state;
}

function deriveBiasFromBucket(avgFinalScore) {
  const pos = Number(process.env.MODEL_BIAS_POSITIVE || 2);
  const neg = Number(process.env.MODEL_BIAS_NEGATIVE || -2);

  if (avgFinalScore >= 80) return pos;
  if (avgFinalScore <= 55) return neg;
  return 0;
}

async function trainIfNeeded(state) {
  const trainAfter = Number(process.env.MODEL_TRAIN_AFTER || 50);
  const minCount = Number(process.env.MODEL_PATTERN_MIN_COUNT || 5);

  if (!state) return;
  if (state.modelVersion >= 2) return; // đã “trained”
  if (state.trainedOn < trainAfter) return;
  if (trainingInProgress) return;

  trainingInProgress = true;
  try {
    const buckets = await assessmentRepo.aggregateTrainingPatterns({
      minCount,
      limit: 80,
    });

    const patterns = buckets
      .map((b) => {
        const location = b._id?.location ?? "Unknown";
        const crop = b._id?.crop ?? "Unknown";
        const avg = Number(b.avgFinalScore ?? 0);
        const bias = deriveBiasFromBucket(avg);

        return {
          key: makeKey(location, crop),
          location,
          crop,
          count: b.count,
          avgFinalScore: avg,
          bias,
        };
      })
      .filter((p) => p.bias !== 0) // chỉ lưu pattern có tác động
      .slice(0, 50);

    // nâng version + tăng nhẹ range aiAdjustment
    const next = await aiModelRepo.updateState({
      modelVersion: 2,
      adjustmentMin: -7,
      adjustmentMax: 18,
      trainedAt: new Date(),
      trainedOnAtTraining: state.trainedOn,
      patterns,
    });

    cache.set(CACHE_KEY, next, STATE_TTL_MS);
  } finally {
    trainingInProgress = false;
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function applyLearningToAdjustment({ input, aiAdjustment, state }) {
  if (!state) return aiAdjustment;

  const location = input.location ?? input?.farmerData?.location ?? "Unknown";
  const crop =
    Array.isArray(input.crops) && input.crops.length
      ? input.crops[0]
      : "Unknown";

  const key = makeKey(location, crop);
  const pattern = Array.isArray(state.patterns)
    ? state.patterns.find((p) => p.key === key)
    : null;

  const bias = pattern?.bias ?? 0;
  const ranged = clamp(
    Math.round(Number(aiAdjustment || 0) + bias),
    Number(state.adjustmentMin ?? -5),
    Number(state.adjustmentMax ?? 15)
  );

  return { adjusted: ranged, bias, pattern: pattern || null };
}

/**
 * Gọi sau khi lưu assessment: tăng trainedOn và nếu đủ ngưỡng thì train.
 * Không block request (fire-and-forget train).
 */
async function onAssessmentSaved() {
  const updated = await aiModelRepo.bumpTrainedOn();
  cache.set(CACHE_KEY, updated, STATE_TTL_MS);

  // train không chặn response
  trainIfNeeded(updated).catch((e) =>
    console.error("[AI_LEARN] train failed:", e?.message || e)
  );

  return updated;
}

module.exports = {
  getStateCached,
  applyLearningToAdjustment,
  onAssessmentSaved,
};
