const { getDb } = require("../../config/db/mongo_client");

const COLLECTION = "ai_model_history";
const col = () => getDb().collection(COLLECTION);

async function insertHistory(doc) {
  const res = await col().insertOne(doc);
  return res.insertedId;
}

async function listHistory({ limit = 20 } = {}) {
  return col().find({}).sort({ trainedAt: -1 }).limit(Number(limit)).toArray();
}

// ✅ NEW: lấy lần train gần nhất
async function getLatestHistory() {
  return col().find({}).sort({ trainedAt: -1 }).limit(1).next();
}

module.exports = { insertHistory, listHistory, getLatestHistory };
