const { GoogleGenerativeAI } = require("@google/generative-ai");

const DEFAULT_MODEL = "gemini-2.5-flash";

let cachedModels = new Map(); // key: modelName -> model instance

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableGeminiError(err) {
  const status = err?.status || err?.statusCode;
  return status === 429 || status === 503;
}

function getModel(modelName = DEFAULT_MODEL) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing GEMINI_API_KEY");
    err.statusCode = 500;
    throw err;
  }

  if (cachedModels.has(modelName)) return cachedModels.get(modelName);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  cachedModels.set(modelName, model);
  return model;
}

async function generateText(prompt, { timeoutMs = 20000, modelName } = {}) {
  const model = getModel(modelName);

  const maxAttempts = 4; // 1 + 3 lần retry
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await Promise.race([
        model.generateContent(String(prompt)),
        new Promise((_, reject) =>
          setTimeout(() => {
            const e = new Error("Gemini timeout");
            e.statusCode = 504;
            reject(e);
          }, timeoutMs)
        ),
      ]);

      return result.response.text();
    } catch (err) {
      lastErr = err;

      if (!isRetryableGeminiError(err) || attempt === maxAttempts) {
        throw err;
      }

      // exponential backoff + jitter
      const base = 600 * Math.pow(2, attempt - 1); // 600, 1200, 2400...
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }

  throw lastErr;
}

module.exports = { generateText, DEFAULT_MODEL };
