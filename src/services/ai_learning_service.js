const { TtlCache } = require("../utils/ttl_cache");
const aiModelRepo = require("../repositories/ai_model_repo");

const cache = new TtlCache();
const CACHE_KEY = "ai_model_state";
const STATE_TTL_MS = Number(process.env.MODEL_STATE_TTL_MS || 30000);

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeKey(location, crop) {
  return `${norm(location)}|${norm(crop)}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function resolveLocation(input) {
  return (
    input?.location ??
    input?.farmerData?.location ??
    input?.analytics?.location ??
    "Unknown"
  );
}

function resolveCrop(input) {
  const crops =
    input?.crops ?? input?.farmerData?.crops ?? input?.analytics?.crops ?? null;

  if (Array.isArray(crops) && crops.length) return crops[0];
  if (typeof crops === "string" && crops.trim().length) return crops;
  return "Unknown";
}

function findPattern(state, location, crop) {
  const key = makeKey(location, crop);
  const patterns = Array.isArray(state?.patterns) ? state.patterns : [];

  // Ưu tiên match theo location+crop (ổn định hơn)
  const byLocCrop = patterns.find((p) => makeKey(p?.location, p?.crop) === key);
  if (byLocCrop) return byLocCrop;

  // Fallback: nếu DB đang lưu p.key đúng format
  const byKey = patterns.find((p) => norm(p?.key) === key);
  return byKey || null;
}

async function getStateCached() {
  const hit = cache.get(CACHE_KEY);
  if (hit) return hit;

  const state = await aiModelRepo.getState();
  cache.set(CACHE_KEY, state, STATE_TTL_MS);
  return state;
}

/**
 * Apply learning bias vào aiAdjustment.
 * ✅ Luôn return object { adjusted, bias, pattern }
 * (tránh case branch return number gây lỗi ngầm)
 */
function applyLearningToAdjustment({ input, aiAdjustment, state }) {
  const base = Number(aiAdjustment || 0);

  if (!state) {
    return { adjusted: base, bias: 0, pattern: null };
  }

  const location = resolveLocation(input);
  const crop = resolveCrop(input);

  const pattern = findPattern(state, location, crop);
  const bias = Number(pattern?.bias ?? 0);

  const adjusted = clamp(
    Math.round(base + bias),
    Number(state.adjustmentMin ?? -5),
    Number(state.adjustmentMax ?? 15)
  );

  return { adjusted, bias, pattern };
}

/**
 * Gọi sau khi lưu assessment:
 * ✅ chỉ bump trainedOn để phản ánh tổng data
 * ❌ không auto-train nữa (BE-301 train qua /api/admin/model/train)
 */
async function onAssessmentSaved() {
  const updated = await aiModelRepo.bumpTrainedOn();
  cache.set(CACHE_KEY, updated, STATE_TTL_MS);
  return updated;
}

module.exports = {
  getStateCached,
  applyLearningToAdjustment,
  onAssessmentSaved,
};
