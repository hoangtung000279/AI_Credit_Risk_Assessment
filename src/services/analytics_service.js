const { getDb } = require("../config/mongo_client");

const col = () => getDb().collection("assessments");

function buildMatch({ from, to } = {}) {
  const match = {};
  if (from || to) {
    match["analytics.createdAt"] = {};
    if (from) match["analytics.createdAt"].$gte = from;
    if (to) match["analytics.createdAt"].$lte = to;
  }
  return match;
}

async function getAnalyticsSummary({ from, to } = {}) {
  const match = buildMatch({ from, to });

  const pipeline = [
    { $match: match },
    {
      $project: {
        a: {
          createdAt: { $ifNull: ["$analytics.createdAt", "$createdAt"] },
          location: {
            $ifNull: [
              "$analytics.location",
              "$location",
              "$farmerData.location",
            ],
          },
          isFpoMember: {
            $ifNull: [
              "$analytics.isFpoMember",
              "$farmerData.isFpoMember",
              "$isFpoMember",
            ],
          },
          finalScore: {
            $ifNull: [
              "$analytics.finalScore",
              "$scores.finalScore",
              "$result.finalScore",
              "$finalScore",
            ],
          },
          riskCategory: {
            $ifNull: [
              "$analytics.riskCategory",
              "$scores.riskCategory",
              "$riskCategory",
            ],
          },
          aiAdjustment: {
            $ifNull: ["$analytics.aiAdjustment", "$scores.aiAdjustment", 0],
          },
        },
      },
    },
    {
      $facet: {
        total: [{ $count: "count" }],

        byProvince: [
          {
            $group: {
              _id: { $ifNull: ["$a.location", "Unknown"] },
              count: { $sum: 1 },
              avgFinalScore: { $avg: "$a.finalScore" },
            },
          },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 50 },
        ],

        byFpo: [
          {
            $group: {
              _id: {
                $cond: [
                  { $eq: ["$a.isFpoMember", true] },
                  "member",
                  {
                    $cond: [
                      { $eq: ["$a.isFpoMember", false] },
                      "non_member",
                      "unknown",
                    ],
                  },
                ],
              },
              count: { $sum: 1 },
              avgFinalScore: { $avg: "$a.finalScore" },
            },
          },
        ],

        riskDistribution: [
          {
            $group: {
              _id: { $ifNull: ["$a.riskCategory", "Unknown"] },
              count: { $sum: 1 },
            },
          },
        ],

        aiAdjustmentDistribution: [
          {
            $group: {
              _id: { $ifNull: ["$a.aiAdjustment", 0] },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ];

  const [facet] = await col()
    .aggregate(pipeline, { allowDiskUse: true })
    .toArray();

  const totalAssessments = facet?.total?.[0]?.count ?? 0;

  return {
    totalAssessments,
    byProvince: (facet?.byProvince ?? []).map((x) => ({
      province: x._id,
      count: x.count,
      avgFinalScore: x.avgFinalScore ?? null,
    })),
    byFpo: facet?.byFpo ?? [],
    riskDistribution: facet?.riskDistribution ?? [],
    aiAdjustmentDistribution: facet?.aiAdjustmentDistribution ?? [],
  };
}

module.exports = { getAnalyticsSummary };
