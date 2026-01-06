const aiLearning = require("../services/ai_learning_service");
const { trainModel } = require("../services/model_training_service");
const historyRepo = require("../repositories/ai_model_history_repo");
const { adminExportKey } = require("../config/env");

function readAdminKey(req) {
  return req.header("x-admin-key") || req.query.key;
}

function ensureAdmin(req, res, startedAt) {
  const key = readAdminKey(req);

  if (!adminExportKey || key !== adminExportKey) {
    res.status(401).json({
      ok: false,
      message: "Unauthorized",
      meta: { latencyMs: Date.now() - startedAt },
    });
    return false;
  }
  return true;
}

// GET /api/admin/model/status
async function status(_req, res) {
  const state = await aiLearning.getStateCached();

  res.status(200).json({
    ok: true,
    model: {
      version: state?.modelVersion ?? 1,
      trainedOn: state?.trainedOn ?? 0,
      trainedAt: state?.trainedAt ?? null,
      adjustmentRange: {
        min: state?.adjustmentMin ?? -5,
        max: state?.adjustmentMax ?? 15,
      },
      trainedOnAtTraining: state?.trainedOnAtTraining ?? 0,
    },
    patternsPreview: Array.isArray(state?.patterns)
      ? state.patterns.slice(0, 10)
      : [],
    lastNotes: state?.lastNotes ?? [],
  });
}

// POST /api/admin/model/train?force=true
async function train(req, res) {
  const startedAt = Date.now();
  if (!ensureAdmin(req, res, startedAt)) return;

  const force = String(req.query.force || "").toLowerCase() === "true";

  try {
    const result = await trainModel({ force });

    res.status(200).json({
      ok: true,
      ...result,
      meta: { latencyMs: Date.now() - startedAt },
    });
  } catch (e) {
    const statusCode =
      e?.statusCode && Number.isFinite(e.statusCode) ? e.statusCode : 500;

    res.status(statusCode).json({
      ok: false,
      message: e?.message || "Training failed",
      meta: { latencyMs: Date.now() - startedAt },
    });
  }
}

// GET /api/admin/model/history?limit=20
async function history(req, res) {
  const startedAt = Date.now();
  if (!ensureAdmin(req, res, startedAt)) return;

  const limit = Number(req.query.limit || 20);

  const items = await historyRepo.listHistory({ limit });

  res.status(200).json({
    ok: true,
    items,
    meta: { latencyMs: Date.now() - startedAt },
  });
}

module.exports = { status, train, history };
