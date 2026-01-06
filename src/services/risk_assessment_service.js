const { calculateBaseScore } = require("./scoring_service");
const geminiService = require("./gemini_service");
const aiLearning = require("./ai_learning_service");

const DEFAULT_MODEL = "gemini-2.5-flash";

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function computeFpoBoost(isFpoMember, fpoTrackRecord) {
  if (!isFpoMember) return 0;

  switch (String(fpoTrackRecord || "").toLowerCase()) {
    case "good":
      return 10;
    case "new":
      return 5;
    case "bad":
      return 0;
    default:
      return 5;
  }
}

function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function pickFirstCrop(input) {
  const crops = input?.crops ?? input?.farmerData?.crops;
  if (Array.isArray(crops) && crops.length > 0) return String(crops[0]);
  if (typeof crops === "string" && crops.trim()) return String(crops);
  return null;
}

/**
 * ✅ BE-204: giảm token prompt
 * Chỉ lấy field quan trọng + derived metrics
 */
function buildAiContext(input, baseResult) {
  const monthlyIncome = Number(input.monthlyIncome) || 0;
  const monthlyDebt = Number(input.monthlyDebtPayment) || 0;

  const dtiPercent =
    monthlyIncome > 0 ? Math.round((monthlyDebt / monthlyIncome) * 100) : null;

  const crops = Array.isArray(input.crops)
    ? input.crops.map(String).slice(0, 5)
    : input.crops
    ? [String(input.crops)].slice(0, 5)
    : [];

  return {
    // profile
    location: input.location ?? null,
    farmSize: input.farmSize ?? null,
    seasonalIncome: Boolean(input.seasonalIncome),
    crops,
    cropCount: crops.length,

    // finance summary
    repaymentHistory: String(input.repaymentHistory || ""),
    businessYears: Number(input.businessYears) || 0,
    hasCollateral: Boolean(input.hasCollateral),
    monthlyIncome,
    monthlyDebtPayment: monthlyDebt,
    dtiPercent,

    // fpo
    isFpoMember: Boolean(input.isFpoMember),
    fpoTrackRecord: input.fpoTrackRecord ?? null,

    // base score summary
    baseScore: baseResult.total,
    baseBreakdown: baseResult.breakdown,
  };
}

function normalizeLearningResult(learned, baseAdj) {
  // aiLearning.applyLearningToAdjustment có thể trả:
  // - number (legacy)
  // - { adjusted, bias, pattern }
  if (typeof learned === "number") {
    return { adjusted: learned, bias: 0, pattern: null };
  }

  if (learned && typeof learned === "object") {
    return {
      adjusted:
        typeof learned.adjusted === "number" ? learned.adjusted : baseAdj,
      bias: typeof learned.bias === "number" ? learned.bias : 0,
      pattern: learned.pattern ?? null,
    };
  }

  return { adjusted: baseAdj, bias: 0, pattern: null };
}

/**
 * ✅ state được truyền vào để tránh gọi DB/cache nhiều lần
 */
async function getAiAdjustment(input, baseResult, state) {
  const minAdj = Number(state?.adjustmentMin ?? -5);
  const maxAdj = Number(state?.adjustmentMax ?? 15);
  const modelVersion = Number(state?.modelVersion ?? 1);
  const trainedOnSnapshot = Number(state?.trainedOn ?? 0);

  const ctx = buildAiContext(input, baseResult);

  const prompt = `
Return JSON ONLY:
{
  "aiAdjustment": number,
  "reasoning": string[],
  "riskSignals": string[],
  "positiveSignals": string[]
}

Constraints:
- aiAdjustment MUST be an integer in range ${minAdj}..${maxAdj}
- reasoning: 3-5 short bullets, no fluff
- Focus on nuances beyond base formula (seasonality, stability, crop mix, local context, FPO track record)
- Do NOT restate the base scoring formula

Simulation context:
- modelVersion=${modelVersion}
- trainedOn=${trainedOnSnapshot}

Context:
${JSON.stringify(ctx)}
`.trim();

  const raw = await geminiService.generateText(prompt, {
    timeoutMs: 5000,
    maxAttempts: 2,
  });

  const obj = extractJson(raw);

  // fallback nếu parse fail
  if (!obj || typeof obj.aiAdjustment !== "number") {
    return {
      aiAdjustment: 0,
      reasoning: ["AI output could not be parsed; adjustment set to 0."],
      riskSignals: [],
      positiveSignals: [],
      meta: {
        model: DEFAULT_MODEL,
        modelVersion,
        trainedOnSnapshot,
        adjustmentRange: { min: minAdj, max: maxAdj },
        learning: { applied: false, bias: 0, pattern: null },
      },
    };
  }

  // 1) clamp theo range model state
  const baseAdj = clamp(Math.round(obj.aiAdjustment), minAdj, maxAdj);

  // 2) apply learning bias (pattern) nếu có
  let finalAdj = baseAdj;
  let learningMeta = { applied: false, bias: 0, pattern: null };

  try {
    const learnedRaw = aiLearning.applyLearningToAdjustment({
      input: {
        ...input,
        // đảm bảo training key crop có dữ liệu, dù client không gửi crops
        crops:
          input?.crops ?? (pickFirstCrop(input) ? [pickFirstCrop(input)] : []),
      },
      aiAdjustment: baseAdj,
      state,
    });

    const learned = normalizeLearningResult(learnedRaw, baseAdj);

    const bias = Number(learned.bias ?? 0);
    finalAdj = Number(learned.adjusted ?? baseAdj);

    learningMeta = {
      applied: bias !== 0,
      bias,
      pattern: learned.pattern
        ? {
            location: learned.pattern.location,
            crop: learned.pattern.crop,
            count: learned.pattern.count,
            avgFinalScore: learned.pattern.avgFinalScore,
          }
        : null,
    };
  } catch {
    // ignore
  }

  const reasoning = Array.isArray(obj.reasoning)
    ? obj.reasoning.map(String).slice(0, 6)
    : [];

  if (learningMeta.applied) {
    const loc = learningMeta.pattern?.location ?? "Unknown";
    const crop = learningMeta.pattern?.crop ?? "Unknown";
    reasoning.push(
      `Learning pattern applied (${loc}, ${crop}): ${
        learningMeta.bias >= 0 ? "+" : ""
      }${learningMeta.bias}`
    );
  }

  return {
    aiAdjustment: clamp(Math.round(finalAdj), minAdj, maxAdj),
    reasoning,
    riskSignals: Array.isArray(obj.riskSignals)
      ? obj.riskSignals.map(String).slice(0, 5)
      : [],
    positiveSignals: Array.isArray(obj.positiveSignals)
      ? obj.positiveSignals.map(String).slice(0, 5)
      : [],
    meta: {
      model: DEFAULT_MODEL,
      modelVersion,
      trainedOnSnapshot,
      adjustmentRange: { min: minAdj, max: maxAdj },
      learning: learningMeta,
    },
  };
}

async function assessRisk(input) {
  const base = calculateBaseScore(input);

  const state = await aiLearning.getStateCached().catch(() => null);

  let ai;
  let aiFallback = false;
  let timeoutFallback = false;

  try {
    ai = await getAiAdjustment(input, base, state);
  } catch (e) {
    const status = e?.statusCode || e?.status;
    timeoutFallback =
      e?.code === "ETIMEDOUT" ||
      e?.name === "AbortError" ||
      /timeout/i.test(String(e?.message || ""));

    const retryable =
      timeoutFallback || status === 429 || status === 503 || status === 504;

    if (!retryable) throw e;

    aiFallback = true;

    const minAdj = Number(state?.adjustmentMin ?? -5);
    const maxAdj = Number(state?.adjustmentMax ?? 15);

    ai = {
      aiAdjustment: 0,
      reasoning: ["AI is temporarily unavailable; adjustment set to 0."],
      riskSignals: [],
      positiveSignals: [],
      meta: {
        model: DEFAULT_MODEL,
        modelVersion: Number(state?.modelVersion ?? 1),
        trainedOnSnapshot: Number(state?.trainedOn ?? 0),
        adjustmentRange: { min: minAdj, max: maxAdj },
        learning: { applied: false, bias: 0, pattern: null },
      },
    };

    console.warn("[AI] fallback (aiAdjustment=0):", e?.message || e);
  }

  const fpoBoost = computeFpoBoost(
    Boolean(input.isFpoMember),
    input.fpoTrackRecord
  );

  const rawFinal = base.total + ai.aiAdjustment + fpoBoost;
  const finalScore = clamp(rawFinal, 0, 100);

  const riskCategory =
    finalScore >= 75
      ? "Low Risk"
      : finalScore >= 50
      ? "Medium Risk"
      : "High Risk";

  return {
    baseScore: base.total,
    baseBreakdown: base.breakdown,
    aiAdjustment: ai.aiAdjustment,
    aiReasoning: ai.reasoning,
    aiSignals: {
      riskSignals: ai.riskSignals,
      positiveSignals: ai.positiveSignals,
    },
    fpoBoost,
    rawFinalScore: rawFinal,
    finalScore,
    riskCategory,
    meta: {
      aiFallback,
      timeoutFallback, // ✅ thêm để persistence/log dùng được, không phá BE cũ
      aiModel: ai?.meta ?? null,
    },
  };
}

module.exports = { assessRisk };
