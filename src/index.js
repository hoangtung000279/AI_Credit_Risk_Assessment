require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing GEMINI_API_KEY");
    err.statusCode = 500;
    throw err;
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Model nhanh cho MVP
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

app.get("/", (_req, res) => {
  res.status(200).send("API is running. Try GET /health");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/ai/ping", async (req, res, next) => {
  try {
    const input = String(req.body?.text ?? "Say OK in one short sentence.");

    const model = getGeminiModel();

    const timeoutMs = 12000;
    const result = await Promise.race([
      model.generateContent(input),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              Object.assign(new Error("Gemini timeout"), { statusCode: 504 })
            ),
          timeoutMs
        )
      ),
    ]);

    const output = result.response.text();

    res.status(200).json({
      ok: true,
      model: "gemini-2.5-flash",
      input,
      output,
    });
  } catch (e) {
    next(e);
  }
});

// ✅ Error handling middleware (BE-102 requirement)
app.use((err, _req, res, _next) => {
  const status =
    err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  console.error("[ERROR]", err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Internal server error" : err.message,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});
