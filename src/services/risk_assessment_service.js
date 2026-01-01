const { calculateBaseScore } = require("./scoring_service");
const geminiService = require("./gemini_service");
const aiLearning = require("./ai_learning_service");

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
    baseBreakdown: baseResult.breakdown, // vẫn giữ để AI hiểu “yếu ở đâu”, nhưng nhẹ hơn full baseResult
  };
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

  // ✅ Prompt ngắn + rõ schema + range động
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

  // ✅ Timeout thấp hơn hard-timeout của controller
  // Nếu gemini_service support maxAttempts => giảm retry để nhanh
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
    const learned = aiLearning.applyLearningToAdjustment({
      input,
      aiAdjustment: baseAdj,
      state,
    });

    const bias = Number(learned?.bias ?? 0);
    finalAdj = Number(learned?.adjusted ?? baseAdj);

    learningMeta = {
      applied: bias !== 0,
      bias,
      pattern: learned?.pattern
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
    aiAdjustment: clamp(finalAdj, minAdj, maxAdj),
    reasoning,
    riskSignals: Array.isArray(obj.riskSignals)
      ? obj.riskSignals.map(String).slice(0, 5)
      : [],
    positiveSignals: Array.isArray(obj.positiveSignals)
      ? obj.positiveSignals.map(String).slice(0, 5)
      : [],
    meta: {
      modelVersion,
      trainedOnSnapshot,
      adjustmentRange: { min: minAdj, max: maxAdj },
      learning: learningMeta,
    },
  };
}

async function assessRisk(input) {
  const base = calculateBaseScore(input);

  // ✅ BE-204: load state 1 lần / request
  const state = await aiLearning.getStateCached().catch(() => null);

  let ai;
  let aiFallback = false;

  try {
    ai = await getAiAdjustment(input, base, state);
  } catch (e) {
    const status = e?.statusCode || e?.status;
    const retryable = status === 429 || status === 503 || status === 504;

    if (!retryable) throw e; // config/code lỗi thì fail để biết

    aiFallback = true;

    const minAdj = Number(state?.adjustmentMin ?? -5);
    const maxAdj = Number(state?.adjustmentMax ?? 15);

    ai = {
      aiAdjustment: 0,
      reasoning: ["AI is temporarily unavailable; adjustment set to 0."],
      riskSignals: [],
      positiveSignals: [],
      meta: {
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
      // ✅ BE-203: expose model info for dashboard + logging
      aiModel: ai?.meta ?? null,
    },
  };
}

module.exports = { assessRisk };
