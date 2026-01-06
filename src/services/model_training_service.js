const assessmentRepo = require("../repositories/assessment_repo");
const aiModelRepo = require("../repositories/ai_model_repo");
const historyRepo = require("../repositories/ai_model_history_repo");

function round1(v) {
  return Math.round(Number(v) * 10) / 10;
}

function computeBias({ avgFinalScore }, cfg) {
  if (avgFinalScore >= 80) return cfg.biasPositive;
  if (avgFinalScore <= 45) return cfg.biasNegative;
  return 0;
}

function buildTrainingNotes({ patterns, before, after }) {
  const pos = patterns.filter((p) => p.bias > 0).length;
  const neg = patterns.filter((p) => p.bias < 0).length;

  return [
    `Patterns discovered: ${patterns.length} (pos=${pos}, neg=${neg}).`,
    `Range: ${before.adjustmentMin}..${before.adjustmentMax} -> ${after.adjustmentMin}..${after.adjustmentMax}.`,
    `Model version: ${before.modelVersion} -> ${after.modelVersion}.`,
  ];
}

function stablePatterns(arr) {
  if (!Array.isArray(arr)) return [];
  return [...arr]
    .map((p) => ({
      key: String(p?.key ?? `${p?.location ?? ""}|${p?.crop ?? ""}`),
      location: String(p?.location ?? ""),
      crop: String(p?.crop ?? ""),
      count: Number(p?.count ?? 0),
      avgFinalScore: Number(p?.avgFinalScore ?? 0),
      bias: Number(p?.bias ?? 0),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function getLatestHistorySafe() {
  if (typeof historyRepo.getLatestHistory === "function") {
    return historyRepo.getLatestHistory();
  }
  if (typeof historyRepo.listHistory === "function") {
    const items = await historyRepo.listHistory({ limit: 1 });
    return Array.isArray(items) ? items[0] : null;
  }
  return null;
}

let trainingLock = false;

async function trainModel({ force = false } = {}) {
  if (trainingLock) {
    return { trained: false, reason: "Training already running" };
  }
  trainingLock = true;

  try {
    const state = await aiModelRepo.getState();

    // ✅ modelVersion lấy từ HISTORY (source of truth)
    const latestHistory = await getLatestHistorySafe();
    const historyVersion = Number(latestHistory?.after?.modelVersion);
    const currentVersion = Number.isFinite(historyVersion)
      ? historyVersion
      : 1.0;

    // trainedOn nên là tổng assessments. Nếu state chưa cập nhật, fallback sang DB.
    let trainedOn = Number(state?.trainedOn ?? 0);
    if (!Number.isFinite(trainedOn) || trainedOn < 0) trainedOn = 0;
    if (trainedOn === 0) {
      const stats = await assessmentRepo.aggregateStats();
      trainedOn = Number(stats?.totalAssessments ?? 0);
    }

    const threshold = Number(process.env.MODEL_TRAIN_AFTER || 100);
    if (!force && trainedOn < threshold) {
      return {
        trained: false,
        reason: `Not enough assessments (trainedOn=${trainedOn}, need=${threshold})`,
        state,
        modelVersion: currentVersion,
      };
    }

    const minCount = Number(process.env.MODEL_PATTERN_MIN_COUNT || 5);
    const biasPositive = Number(process.env.MODEL_BIAS_POSITIVE || 2);
    const biasNegative = Number(process.env.MODEL_BIAS_NEGATIVE || -2);

    const rows = await assessmentRepo.aggregateTrainingPatterns({
      minCount,
      limit: 50,
    });

    const nextPatterns = stablePatterns(
      rows
        .map((r) => {
          const location = String(r._id.location || "unknown");
          const crop = String(r._id.crop || "unknown");
          const avgFinalScore = Number(r.avgFinalScore ?? 0);
          const count = Number(r.count ?? 0);

          const bias = computeBias(
            { avgFinalScore },
            { biasPositive, biasNegative }
          );

          return {
            key: `${location}|${crop}`,
            location,
            crop,
            count,
            avgFinalScore: round1(avgFinalScore),
            bias,
          };
        })
        .filter((p) => p.bias !== 0)
    );

    // ✅ trainedOnAtTraining lấy ưu tiên từ state, fallback từ history
    const trainedOnAtTraining = Number.isFinite(
      Number(state?.trainedOnAtTraining)
    )
      ? Number(state?.trainedOnAtTraining)
      : Number(latestHistory?.after?.trainedOnAtTraining ?? 0);

    const before = {
      modelVersion: currentVersion, // ✅ không dùng state.modelVersion nữa
      adjustmentMin: Number(state?.adjustmentMin ?? -5),
      adjustmentMax: Number(state?.adjustmentMax ?? 15),
      trainedOnAtTraining,
      patterns: stablePatterns(state?.patterns),
    };

    const hasNewData = trainedOn > before.trainedOnAtTraining;
    const patternsChanged =
      JSON.stringify(before.patterns) !== JSON.stringify(nextPatterns);

    // ✅ Guard: nếu không có data mới + patterns không đổi => KHÔNG bump version / KHÔNG ghi history
    if (!hasNewData && !patternsChanged) {
      return {
        trained: false,
        reason: "No new data / no pattern changes since last training",
        trainedOn,
        trainedOnAtTraining: before.trainedOnAtTraining,
        modelVersion: before.modelVersion,
        patternsCount: nextPatterns.length,
        patternsPreview: nextPatterns.slice(0, 10),
      };
    }

    // ✅ bump version dựa trên HISTORY
    const nextVersion = round1(before.modelVersion + 0.5);

    const maxCap = Number(process.env.MODEL_ADJ_MAX_CAP || 20);
    const minCap = Number(process.env.MODEL_ADJ_MIN_CAP || -8);

    const after = {
      modelVersion: nextVersion,
      adjustmentMin: Math.max(minCap, before.adjustmentMin),
      adjustmentMax: Math.min(maxCap, before.adjustmentMax + 2),
      trainedAt: new Date(),
      trainedOnAtTraining: trainedOn,
      patterns: nextPatterns,
    };

    const notes = buildTrainingNotes({
      patterns: after.patterns,
      before,
      after,
    });

    const updated = await aiModelRepo.updateState({
      modelVersion: after.modelVersion,
      adjustmentMin: after.adjustmentMin,
      adjustmentMax: after.adjustmentMax,
      trainedAt: after.trainedAt,
      trainedOnAtTraining: after.trainedOnAtTraining,
      patterns: after.patterns,
      lastNotes: notes,
      // (optional) nếu repo bạn có field trainedOn thì update luôn cho chuẩn
      trainedOn,
    });

    await historyRepo.insertHistory({
      trainedAt: after.trainedAt,
      isForced: Boolean(force),
      trainedOn: after.trainedOnAtTraining,
      before: {
        modelVersion: before.modelVersion,
        adjustmentMin: before.adjustmentMin,
        adjustmentMax: before.adjustmentMax,
        trainedOnAtTraining: before.trainedOnAtTraining,
      },
      after: {
        modelVersion: after.modelVersion,
        adjustmentMin: after.adjustmentMin,
        adjustmentMax: after.adjustmentMax,
        trainedOnAtTraining: after.trainedOnAtTraining,
        patternsCount: after.patterns.length,
      },
      notes,
      patternsPreview: after.patterns.slice(0, 10),
    });

    return {
      trained: true,
      state: updated,
      patternsCount: after.patterns.length,
      notes,
      patternsPreview: after.patterns.slice(0, 10),
    };
  } finally {
    trainingLock = false;
  }
}

module.exports = { trainModel };
