// src/models/assessment/assessment_request_dto.js

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeAssessmentRequest(body = {}) {
  return {
    clientId: body.id ? String(body.id).trim() : null,
    clientCreatedAt: toIsoOrNull(body.createdAt), // lưu ISO string cho nhất quán

    fullName: body.fullName?.trim() || null,
    phone: body.phone?.trim() || null,

    location: body.location || body.province || null,
    province: body.province || null,
    district: body.district || null,

    farmSize: Number.isFinite(Number(body.farmSize))
      ? Number(body.farmSize)
      : null,
    crops: body.crops ? String(body.crops).trim() : null,

    monthlyIncome: Number(body.monthlyIncome),
    monthlyDebtPayment: Number(body.monthlyDebtPayment),
    businessYears: Number(body.businessYears),

    // seasonalIncome bạn đã chốt là NUMBER
    seasonalIncome:
      body.seasonalIncome === undefined || body.seasonalIncome === null
        ? null
        : Number(body.seasonalIncome),

    repaymentHistory: String(body.repaymentHistory || "").toLowerCase(),

    // internal derived (client không gửi)
    hasCollateral: Number(body.farmSize) > 0,

    isFpoMember: Boolean(body.isFpoMember),
    fpoName: body.fpoName || null,
    fpoRole: body.fpoRole || null,
    fpoTrackRecord: body.fpoTrackRecord || null,
  };
}

module.exports = { normalizeAssessmentRequest };
