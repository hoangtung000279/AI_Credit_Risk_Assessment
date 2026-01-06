function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asString(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeKey(v) {
  const s = asString(v);
  return s ? s.toLowerCase() : null;
}

function firstCrop(input) {
  const crops = input?.crops;
  if (Array.isArray(crops) && crops.length > 0) return asString(crops[0]);
  if (typeof crops === "string") return asString(crops);
  return null;
}

function dtiBucket(ratio) {
  if (ratio == null) return "unknown";
  const pct = ratio * 100;
  if (pct < 30) return "<30";
  if (pct < 40) return "30-39";
  if (pct < 50) return "40-49";
  if (pct < 60) return "50-59";
  if (pct < 70) return "60-69";
  return ">=70";
}

function yearsBucket(y) {
  if (y == null) return "unknown";
  if (y > 10) return ">10";
  if (y >= 5) return "5-10";
  if (y >= 3) return "3-5";
  if (y >= 1) return "1-3";
  return "<1";
}

function buildAnalytics({ input, result, meta }) {
  const monthlyIncome = toNumber(input.monthlyIncome);
  const monthlyDebtPayment = toNumber(input.monthlyDebtPayment);

  const ratio =
    monthlyIncome && monthlyIncome > 0 && monthlyDebtPayment != null
      ? monthlyDebtPayment / monthlyIncome
      : null;

  const cropCount = Array.isArray(input.crops) ? input.crops.length : 0;
  const crop = normalizeKey(firstCrop(input.crops));
  const location = asString(input.location ?? null);
  const locationKey = normalizeKey(location);

  return {
    createdAt: new Date(),
    location,
    crop,
    locationKey,
    cropKey: crop,
    // location: input.location ?? null,
    isFpoMember: Boolean(input.isFpoMember),
    fpoTrackRecord: input.fpoTrackRecord ?? null,

    baseScore: result.baseScore ?? null,
    aiAdjustment: result.aiAdjustment ?? 0,
    fpoBoost: result.fpoBoost ?? 0,
    finalScore: result.finalScore ?? null,
    riskCategory: result.riskCategory ?? null,

    repaymentHistory: input.repaymentHistory
      ? String(input.repaymentHistory).toLowerCase()
      : null,

    dtiRatio: ratio,
    dtiBucket: dtiBucket(ratio),
    businessYearsBucket: yearsBucket(toNumber(input.businessYears)),
    cropCount,
    seasonalIncome: Boolean(input.seasonalIncome),

    aiFallback: Boolean(result?.meta?.aiFallback),
    timeoutFallback: Boolean(result?.meta?.timeoutFallback),
    latencyMs: Number.isFinite(meta?.latencyMs) ? meta.latencyMs : null,
    model: meta?.model ?? "gemini-2.5-flash",
  };
}

module.exports = { buildAnalytics };
