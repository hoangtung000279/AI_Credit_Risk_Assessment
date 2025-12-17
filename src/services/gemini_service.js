const { GoogleGenerativeAI } = require("@google/generative-ai");

const DEFAULT_MODEL = "gemini-2.5-flash";

// Cache model theo modelName
const cachedModels = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getStatus(err) {
  return (
    err?.statusCode ??
    err?.status ??
    err?.response?.status ??
    err?.cause?.status ??
    undefined
  );
}

function isRetryableGeminiError(err) {
  const status = getStatus(err);
  const code = err?.code;

  // 429: rate limit/quota, 503: overloaded, 504: gateway timeout
  if (status === 429 || status === 503 || status === 504) return true;

  // Một số lỗi network thường gặp
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }

  return false;
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

  // Gợi ý: set generationConfig để output ngắn + ổn định (đỡ tốn quota/time)
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  });

  cachedModels.set(modelName, model);
  return model;
}

function parseRetryAfterMs(err) {
  // 1) Parse từ message: "Please retry in 50.11s"
  const msg = String(err?.message || "");
  const m = msg.match(/retry in\s+([\d.]+)s/i);
  if (m) return Math.ceil(Number(m[1]) * 1000);

  // 2) Parse từ errorDetails (nếu SDK trả)
  const details = err?.errorDetails;
  if (Array.isArray(details)) {
    const retry = details.find(
      (d) =>
        typeof d === "object" && String(d["@type"] || "").includes("RetryInfo")
    );
    const s = retry?.retryDelay; // ví dụ "50s"
    const m2 = String(s || "").match(/([\d.]+)s/i);
    if (m2) return Math.ceil(Number(m2[1]) * 1000);
  }

  return null;
}

/**
 * Semaphore nhỏ để hạn chế concurrency -> tránh bắn nhiều request Gemini cùng lúc
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.count = 0;
    this.queue = [];
  }
  acquire() {
    return new Promise((resolve) => {
      if (this.count < this.max) {
        this.count++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }
  release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.count = Math.max(0, this.count - 1);
    }
  }
}

const geminiSemaphore = new Semaphore(
  Number(process.env.GEMINI_MAX_CONCURRENT || 1)
);

async function generateText(
  prompt,
  {
    timeoutMs = 20000,
    modelName,
    maxAttempts = 3, // giảm retry để MVP phản hồi nhanh
    maxRetryDelayMs = 8000, // QUAN TRỌNG: không chờ 50s trong 1 request
  } = {}
) {
  const model = getModel(modelName);
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await geminiSemaphore.acquire();
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

      const retryAfter = parseRetryAfterMs(err);
      if (retryAfter != null) {
        // Nếu Google yêu cầu đợi quá lâu (vd 50s), fail nhanh để service fallback
        if (retryAfter > maxRetryDelayMs) {
          const e = new Error(
            `Gemini rate-limited. Retry after ~${Math.ceil(retryAfter / 1000)}s`
          );
          e.statusCode = getStatus(err) || 429;
          e.original = err;
          throw e;
        }

        await sleep(retryAfter + Math.floor(Math.random() * 250));
        continue;
      }

      // Exponential backoff + jitter (nhỏ)
      const base = 400 * Math.pow(2, attempt - 1); // 400, 800, 1600...
      const jitter = Math.floor(Math.random() * 200);
      await sleep(base + jitter);
    } finally {
      geminiSemaphore.release();
    }
  }

  throw lastErr;
}

module.exports = { generateText, DEFAULT_MODEL };
