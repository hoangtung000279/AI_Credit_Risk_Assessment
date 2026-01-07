const { aggregateStats } = require("../assessment/assessment_repo"); // hoặc repositories đúng của bạn
const { TtlCache } = require("../../utils/ttl_cache");

const cache = new TtlCache();
const TTL_MS = 60 * 1000; // 60s

function cacheKey({ from, to }) {
  return `stats:${from ? from.toISOString() : "null"}:${
    to ? to.toISOString() : "null"
  }`;
}

async function getAdminStats({ from, to } = {}) {
  const key = cacheKey({ from, to });
  const hit = cache.get(key);
  if (hit) return { ...hit, meta: { ...(hit.meta || {}), cache: "HIT" } };

  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  const data = await aggregateStats({ match });
  const payload = {
    ...data,
    meta: { ...(data.meta || {}), cache: "MISS", ttlMs: TTL_MS },
  };

  cache.set(key, payload, TTL_MS);
  return payload;
}

module.exports = { getAdminStats };
