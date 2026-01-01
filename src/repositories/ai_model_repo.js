const { getDb } = require("../config/mongo_client");

const COLLECTION = "ai_model_state";
const ID = "current";

const col = () => getDb().collection(COLLECTION);

// ✅ Chỉ chứa “data fields”, KHÔNG chứa createdAt/updatedAt
function baseState() {
  return {
    _id: ID,
    modelVersion: 1,
    trainedOn: 0,
    adjustmentMin: -5,
    adjustmentMax: 15,
    trainedAt: null,
    trainedOnAtTraining: 0,
    patterns: [], // [{ key, location, crop, count, avgFinalScore, bias }]
  };
}

function sanitizePatch(patch) {
  if (!patch || typeof patch !== "object") return {};
  const { _id, createdAt, updatedAt, ...safe } = patch;
  return safe;
}

async function ensureState() {
  await col().updateOne(
    { _id: ID },
    {
      $setOnInsert: { ...baseState(), createdAt: new Date() },
      $currentDate: { updatedAt: true },
    },
    { upsert: true }
  );
}

async function getState() {
  await ensureState();
  return col().findOne({ _id: ID });
}

async function bumpTrainedOn() {
  // ✅ đảm bảo doc tồn tại trước
  await ensureState();

  // ✅ CHỈ inc, KHÔNG setOnInsert, KHÔNG upsert => không conflict
  const res = await col().findOneAndUpdate(
    { _id: ID },
    {
      $inc: { trainedOn: 1 },
      $currentDate: { updatedAt: true },
    },
    { returnDocument: "after" }
  );

  return res.value;
}

async function updateState(patch) {
  await ensureState();
  const safePatch = sanitizePatch(patch);

  const res = await col().findOneAndUpdate(
    { _id: ID },
    {
      $set: safePatch,
      $currentDate: { updatedAt: true },
    },
    { returnDocument: "after" }
  );

  return res.value;
}

module.exports = { getState, bumpTrainedOn, updateState };
