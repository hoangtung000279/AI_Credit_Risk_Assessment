const { getDb } = require("../../config/db/mongo_client");

const COLLECTION = "assessments";
const col = () => getDb().collection(COLLECTION); // ✅ dùng chung 1 helper

async function aggregateStats({ match = {} } = {}) {
  const pipeline = [];

  if (match && Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  pipeline.push({
    $project: {
      location: 1,
      createdAt: 1,
      farmerData: 1,
      scores: 1,
      finalScore: 1,
      riskCategory: 1,
      result: 1,
      isFpoMember: 1,
    },
  });

  pipeline.push({
    $addFields: {
      _location: { $ifNull: ["$location", "$farmerData.location"] },
      _isFpo: { $ifNull: ["$farmerData.isFpoMember", "$isFpoMember"] },
      _finalScore: {
        $ifNull: ["$scores.finalScore", "$finalScore", "$result.finalScore"],
      },
    },
  });

  pipeline.push({
    $addFields: {
      _riskCategory: {
        $ifNull: [
          "$scores.riskCategory",
          "$riskCategory",
          {
            $cond: [
              { $gte: ["$_finalScore", 75] },
              "Low Risk",
              {
                $cond: [
                  { $gte: ["$_finalScore", 50] },
                  "Medium Risk",
                  "High Risk",
                ],
              },
            ],
          },
        ],
      },
    },
  });

  pipeline.push({
    $facet: {
      total: [{ $count: "count" }],
      byProvince: [
        {
          $group: {
            _id: { $ifNull: ["$_location", "Unknown"] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 100 },
      ],
      byFpo: [
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$_isFpo", true] },
                "member",
                {
                  $cond: [{ $eq: ["$_isFpo", false] }, "non_member", "unknown"],
                },
              ],
            },
            count: { $sum: 1 },
          },
        },
      ],
      riskDistribution: [
        {
          $group: {
            _id: { $ifNull: ["$_riskCategory", "Unknown"] },
            count: { $sum: 1 },
          },
        },
      ],
    },
  });

  const [facet] = await col().aggregate(pipeline).toArray();

  const totalAssessments = facet?.total?.[0]?.count ?? 0;

  const byProvince = (facet?.byProvince ?? []).map((x) => ({
    province: x._id,
    count: x.count,
  }));

  const byFpo = { members: 0, nonMembers: 0, unknown: 0 };
  for (const row of facet?.byFpo ?? []) {
    if (row._id === "member") byFpo.members = row.count;
    else if (row._id === "non_member") byFpo.nonMembers = row.count;
    else byFpo.unknown += row.count;
  }

  const riskDistribution = { low: 0, medium: 0, high: 0, unknown: 0 };
  for (const row of facet?.riskDistribution ?? []) {
    const k = String(row._id || "").toLowerCase();
    if (k.includes("low")) riskDistribution.low = row.count;
    else if (k.includes("medium")) riskDistribution.medium = row.count;
    else if (k.includes("high")) riskDistribution.high = row.count;
    else riskDistribution.unknown += row.count;
  }

  return {
    totalAssessments,
    byProvince,
    byFpo,
    riskDistribution,
    meta: { collection: COLLECTION },
  };
}

function cursorForExport({ from, to } = {}) {
  const filter = {};
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return col()
    .find(filter, {
      projection: {
        createdAt: 1,
        location: 1,

        // schema mới/cũ
        input: 1,
        farmerData: 1,
        scores: 1,
        result: 1,

        // terms
        loanTerms: 1,
        loanTermsWithout: 1,

        // nếu bạn lưu flat
        finalScore: 1,
        riskCategory: 1,
      },
    })
    .sort({ createdAt: -1 });
}

module.exports = { aggregateStats, cursorForExport };
