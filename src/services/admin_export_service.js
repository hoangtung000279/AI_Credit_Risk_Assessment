const assessmentRepo = require("./assessment_repo");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toIso(date) {
  try {
    return date ? new Date(date).toISOString() : "";
  } catch {
    return "";
  }
}

function pickExportRow(doc) {
  // Hỗ trợ nhiều schema: bạn đang lưu dạng farmerData / scores
  const farmer = doc.farmerData || doc.input || {};
  const scores = doc.scores || doc.result || {};

  return {
    assessmentId: doc._id?.toString?.() || "",
    createdAt: toIso(doc.createdAt),
    location: doc.location || farmer.location || "",
    isFpoMember: Boolean(farmer.isFpoMember),
    fpoTrackRecord: farmer.fpoTrackRecord || "",
    baseScore: scores.baseScore ?? "",
    aiAdjustment: scores.aiAdjustment ?? "",
    fpoBoost: scores.fpoBoost ?? "",
    finalScore: scores.finalScore ?? "",
    riskCategory: scores.riskCategory || "",
  };
}

/**
 * CSV Export (default)
 * GET /api/admin/export
 * Optional: /api/admin/export?from=...&to=...
 */
async function exportAssessmentsCsv(res, { from, to } = {}) {
  // ✅ tạo cursor trước để nếu lỗi thì middleware trả JSON (chưa send headers)
  const cursor = assessmentRepo.cursorForExport({ from, to });

  const fileName = `assessments_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Cache-Control", "no-store");

  // BOM để Excel mở tiếng Việt/UTF-8 không lỗi
  res.write("\ufeff");

  const headers = [
    "assessmentId",
    "createdAt",
    "location",
    "isFpoMember",
    "fpoTrackRecord",
    "baseScore",
    "aiAdjustment",
    "fpoBoost",
    "finalScore",
    "riskCategory",
  ];

  res.write(headers.join(",") + "\n");

  try {
    for await (const doc of cursor) {
      const row = pickExportRow(doc);
      const line = headers.map((h) => csvEscape(row[h])).join(",") + "\n";
      res.write(line);
    }
  } finally {
    res.end();
  }
}

/**
 * JSON Export (object like BE-106)
 * GET /api/admin/export?format=json
 * Optional: /api/admin/export?format=json&from=...&to=...
 */
async function exportAssessmentsJson(res, { from, to } = {}) {
  const startedAt = Date.now();

  const cursor = assessmentRepo.cursorForExport({ from, to });

  const data = [];
  for await (const doc of cursor) {
    data.push(pickExportRow(doc)); // reuse row mapping (anonymized)
  }

  res.status(200).json({
    ok: true,
    totalAssessments: data.length,
    data,
    meta: {
      collection: "assessments",
      format: "json",
      anonymized: true,
      latencyMs: Date.now() - startedAt,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    },
  });
}

module.exports = { exportAssessmentsCsv, exportAssessmentsJson };
