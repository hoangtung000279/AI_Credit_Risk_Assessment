const { GoogleGenerativeAI } = require("@google/generative-ai");

const DEFAULT_MODEL = "gemini-2.5-flash";

let cachedModels = new Map(); // key: modelName -> model instance

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

async function generateText(prompt, { timeoutMs = 12000, modelName } = {}) {
  const model = getModel(modelName);

  const result = await Promise.race([
    model.generateContent(String(prompt)),
    new Promise((_, reject) =>
      setTimeout(() => {
        const err = new Error("Gemini timeout");
        err.statusCode = 504;
        reject(err);
      }, timeoutMs)
    ),
  ]);

  return result.response.text();
}

module.exports = { generateText, DEFAULT_MODEL };
