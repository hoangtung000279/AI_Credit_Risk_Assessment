const repoPath = require.resolve("../repositories/assessment_repo");
const repo = require(repoPath);

const { TtlCache } = require("../utils/ttl_cache");

const cache = new TtlCache();
const TTL_MS = 60 * 60 * 1000;

function cacheKey({ from, to }) {
  return `dashboard:${from ? from.toISOString() : "null"}:${
    to ? to.toISOString() : "null"
  }`;
}

async function getAdminDashboard({ from, to } = {}) {
  const key = cacheKey({ from, to });
  const cached = cache.get(key);
  if (cached)
    return { ...cached, meta: { ...(cached.meta || {}), cache: "HIT" } };

  // ✅ gọi trực tiếp từ repo (không destructure nữa)
  const data = await repo.aggregateDashboard({ from, to });

  const payload = { ...data, meta: { cache: "MISS", ttlMs: TTL_MS } };
  cache.set(key, payload, TTL_MS);
  return payload;
}

module.exports = { getAdminDashboard };
