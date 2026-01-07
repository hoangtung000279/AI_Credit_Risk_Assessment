const { getDb } = require("../../config/db/mongo_client");

const COLLECTION = "assessments";
const col = () => getDb().collection(COLLECTION);

// =========================
// WRITE
// =========================
async function insertAssessment(doc) {
  const res = await col().insertOne(doc);
  return res.insertedId;
}

// =========================
// BE-106: Stats
// =========================
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

// =========================
// BE-107: Export CSV cursor
// =========================
function cursorForExport() {
  return col()
    .find(
      {},
      {
        projection: {
          createdAt: 1,
          location: 1,

          "farmerData.isFpoMember": 1,
          "farmerData.fpoTrackRecord": 1,
          "farmerData.location": 1,

          "scores.baseScore": 1,
          "scores.aiAdjustment": 1,
          "scores.fpoBoost": 1,
          "scores.finalScore": 1,
          "scores.riskCategory": 1,
        },
      }
    )
    .sort({ createdAt: -1 });
}

// =========================
// Helpers (date filter)
// =========================
function buildMatch({ from, to } = {}) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }
  return match;
}

// =========================
// BE-202: Dashboard aggregate
// =========================
async function aggregateDashboard({ from, to } = {}) {
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
          fpoName: {
            $ifNull: ["$analytics.fpoName", "$farmerData.fpoName", null],
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
              "Unknown",
            ],
          },
          aiAdjustment: {
            $ifNull: ["$analytics.aiAdjustment", "$scores.aiAdjustment", 0],
          },

          aiFallback: {
            $ifNull: ["$analytics.aiFallback", "$meta.aiFallback", false],
          },
          timeoutFallback: {
            $ifNull: [
              "$analytics.timeoutFallback",
              "$meta.timeoutFallback",
              false,
            ],
          },
          latencyMs: {
            $ifNull: ["$analytics.latencyMs", "$meta.latencyMs", null],
          },
          model: { $ifNull: ["$analytics.model", "gemini-2.5-flash"] },
        },
      },
    },

    {
      $facet: {
        total: [{ $count: "count" }],

        byDay: [
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$a.createdAt" },
              },
              count: { $sum: 1 },
              avgFinalScore: { $avg: "$a.finalScore" },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 120 },
        ],

        byProvince: [
          {
            $group: {
              _id: { $ifNull: ["$a.location", "Unknown"] },
              count: { $sum: 1 },
              avgFinalScore: { $avg: "$a.finalScore" },
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
          { $sort: { count: -1, _id: 1 } },
        ],

        topFpos: [
          { $match: { "a.fpoName": { $ne: null } } },
          {
            $group: {
              _id: "$a.fpoName",
              count: { $sum: 1 },
              avgFinalScore: { $avg: "$a.finalScore" },
            },
          },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
        ],

        aiPerformance: [
          {
            $group: {
              _id: "$a.model",
              total: { $sum: 1 },
              fallbackCount: {
                $sum: { $cond: [{ $eq: ["$a.aiFallback", true] }, 1, 0] },
              },
              timeoutFallbackCount: {
                $sum: { $cond: [{ $eq: ["$a.timeoutFallback", true] }, 1, 0] },
              },
              nonZeroAdjustmentCount: {
                $sum: { $cond: [{ $ne: ["$a.aiAdjustment", 0] }, 1, 0] },
              },
              avgAiAdjustment: { $avg: "$a.aiAdjustment" },
              avgLatencyMs: { $avg: "$a.latencyMs" },
            },
          },
          { $sort: { total: -1 } },
        ],
      },
    },
  ];

  const [facet] = await col()
    .aggregate(pipeline, { allowDiskUse: true })
    .toArray();

  return {
    totalAssessments: facet?.total?.[0]?.count ?? 0,

    byDay: (facet?.byDay ?? []).map((x) => ({
      day: x._id,
      count: x.count,
      avgFinalScore: x.avgFinalScore ?? null,
    })),

    byProvince: (facet?.byProvince ?? []).map((x) => ({
      province: x._id,
      count: x.count,
      avgFinalScore: x.avgFinalScore ?? null,
    })),

    byFpo: facet?.byFpo ?? [],
    riskDistribution: facet?.riskDistribution ?? [],
    topFpos: facet?.topFpos ?? [],

    aiPerformance: (facet?.aiPerformance ?? []).map((x) => ({
      model: x._id,
      total: x.total,
      fallbackRate: x.total ? x.fallbackCount / x.total : 0,
      timeoutFallbackRate: x.total ? x.timeoutFallbackCount / x.total : 0,
      nonZeroAdjustmentRate: x.total ? x.nonZeroAdjustmentCount / x.total : 0,
      avgAiAdjustment: x.avgAiAdjustment ?? 0,
      avgLatencyMs: x.avgLatencyMs ?? null,
    })),

    meta: { collection: COLLECTION },
  };
}

async function aggregateTrainingPatterns({
  from,
  to,
  minCount = 5,
  limit = 50,
} = {}) {
  const match = buildMatch({ from, to });

  const pipeline = [];

  if (match && Object.keys(match).length) pipeline.push({ $match: match });

  pipeline.push(
    {
      $project: {
        a: {
          createdAt: { $ifNull: ["$analytics.createdAt", "$createdAt"] },

          // ưu tiên analytics.* (đã normalize), fallback schema cũ
          locationRaw: {
            $ifNull: [
              "$analytics.locationKey",
              "$analytics.location",
              "$location",
              "$farmerData.location",
              "Unknown",
            ],
          },
          cropRaw: {
            $ifNull: [
              "$analytics.cropKey",
              "$analytics.crop",
              { $arrayElemAt: ["$farmerData.crops", 0] },
              "Unknown",
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
          aiAdjustment: {
            $ifNull: [
              "$analytics.aiAdjustment",
              "$scores.aiAdjustment",
              "$result.aiAdjustment",
              0,
            ],
          },
        },
      },
    },
    // normalize key để group ổn định (lowercase + trim)
    {
      $addFields: {
        locationKey: {
          $toLower: { $trim: { input: { $toString: "$a.locationRaw" } } },
        },
        cropKey: {
          $toLower: { $trim: { input: { $toString: "$a.cropRaw" } } },
        },
      },
    },
    // lọc rác
    {
      $match: {
        locationKey: { $nin: [null, "", "unknown"] },
        cropKey: { $nin: [null, "", "unknown"] },
        "a.finalScore": { $ne: null },
      },
    },
    // group patterns
    {
      $group: {
        _id: { location: "$locationKey", crop: "$cropKey" },
        count: { $sum: 1 },
        avgFinalScore: { $avg: "$a.finalScore" },
        avgAiAdjustment: { $avg: "$a.aiAdjustment" },
        lastSeen: { $max: "$a.createdAt" },
      },
    },
    { $match: { count: { $gte: Number(minCount) } } },
    { $sort: { avgFinalScore: -1, count: -1 } },
    { $limit: Number(limit) }
  );

  return col().aggregate(pipeline, { allowDiskUse: true }).toArray();
}

module.exports = {
  insertAssessment,
  aggregateStats,
  cursorForExport,
  aggregateDashboard,
  buildMatch,
  aggregateTrainingPatterns,
};
