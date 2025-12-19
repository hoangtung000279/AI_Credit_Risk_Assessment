const { calculateBaseScore } = require("./scoring_service");
const geminiService = require("./gemini_service");

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

async function getAiAdjustment(input, baseResult) {
  // Prompt “khoá chặt” output JSON để parse ổn
  const prompt = `
You are an agricultural credit risk analyst.
Return JSON ONLY with this exact schema:
{
  "aiAdjustment": number,        // integer in range -5..15
  "reasoning": string[],         // 3-6 bullet reasons, short
  "riskSignals": string[],       // 0-5 items
  "positiveSignals": string[]    // 0-5 items
}

Rules:
- aiAdjustment MUST be an integer.
- Range strictly -5..15.
- Use applicant context: seasonal income, farm profile, trends, FPO context.
- Do NOT repeat base scoring rules. Focus on nuanced factors beyond formula.

Applicant data:
${JSON.stringify(input)}

Base score:
${JSON.stringify(baseResult)}
`.trim();

  const raw = await geminiService.generateText(prompt, { timeoutMs: 25000 });

  const obj = extractJson(raw);

  // Fallback an toàn nếu AI trả format không đúng
  if (!obj || typeof obj.aiAdjustment !== "number") {
    return {
      aiAdjustment: 0,
      reasoning: ["AI output could not be parsed; adjustment set to 0."],
      riskSignals: [],
      positiveSignals: [],
      rawText: raw,
    };
  }

  const aiAdjustment = clamp(Math.round(obj.aiAdjustment), -5, 15);

  return {
    aiAdjustment,
    reasoning: Array.isArray(obj.reasoning) ? obj.reasoning.map(String) : [],
    riskSignals: Array.isArray(obj.riskSignals)
      ? obj.riskSignals.map(String)
      : [],
    positiveSignals: Array.isArray(obj.positiveSignals)
      ? obj.positiveSignals.map(String)
      : [],
  };
}

async function assessRisk(input) {
  const base = calculateBaseScore(input);

  let ai;
  let aiFallback = false;

  try {
    ai = await getAiAdjustment(input, base);
  } catch (e) {
    const status = e?.statusCode || e?.status;
    const retryable = status === 429 || status === 503 || status === 504;

    if (!retryable) throw e; // lỗi config/code -> fail để bạn biết

    aiFallback = true;
    ai = {
      aiAdjustment: 0,
      reasoning: ["AI is temporarily unavailable; adjustment set to 0."],
      riskSignals: [],
      positiveSignals: [],
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
    },
  };
}

module.exports = { assessRisk };
