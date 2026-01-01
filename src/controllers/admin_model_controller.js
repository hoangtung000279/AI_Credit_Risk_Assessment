const aiLearning = require("../services/ai_learning_service");

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
  });
}

module.exports = { status };
