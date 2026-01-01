// src/config/mongo_indexes.js
const { getDb } = require("./mongo_client");

function sameKeySpec(a, b) {
  const ae = Object.entries(a || {});
  const be = Object.entries(b || {});
  if (ae.length !== be.length) return false;
  for (let i = 0; i < ae.length; i++) {
    if (ae[i][0] !== be[i][0]) return false;
    if (ae[i][1] !== be[i][1]) return false;
  }
  return true;
}

async function ensureMongoIndexes() {
  const db = getDb();
  const col = db.collection("assessments");

  let existing = await col.indexes();

  async function ensure(keys, options = {}) {
    const found = existing.find((i) => sameKeySpec(i.key, keys));
    if (found) {
      //   console.log(`[MongoDB] index exists: ${found.name}`);
      return;
    }

    try {
      const name = await col.createIndex(keys, options); // ❗ không set name
      //   console.log(`[MongoDB] index created: ${name}`);
      existing = await col.indexes(); // refresh
    } catch (e) {
      // Nếu DB đã có index cùng key nhưng khác tên -> coi như OK, skip
      if (e?.code === 85) {
        existing = await col.indexes();
        const found2 = existing.find((i) => sameKeySpec(i.key, keys));
        // console.log(
        //   `[MongoDB] index already exists (conflict name). Using existing: ${
        //     found2?.name || "unknown"
        //   }`
        // );
        return;
      }
      throw e;
    }
  }

  // Minimal set cho BE-204 (fast dashboard + export)
  await ensure({ createdAt: -1 });
  await ensure({ "analytics.createdAt": -1 });
  await ensure({ "analytics.location": 1, "analytics.createdAt": -1 });
  await ensure({ "analytics.isFpoMember": 1, "analytics.createdAt": -1 });
  await ensure({ "analytics.riskCategory": 1, "analytics.createdAt": -1 });

  //   console.log("[MongoDB] Index ensure done");
}

module.exports = { ensureMongoIndexes };
