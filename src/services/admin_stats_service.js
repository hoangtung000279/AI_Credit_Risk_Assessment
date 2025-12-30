const assessmentRepo = require("./assessment_repo");

async function getAdminStats({ from, to } = {}) {
  const match = {};

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  return assessmentRepo.aggregateStats({ match });
}

module.exports = { getAdminStats };
