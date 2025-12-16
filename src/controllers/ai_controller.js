const geminiService = require("../services/gemini_service");

async function ping(req, res) {
  const input = String(req.body?.text ?? "Say OK in one short sentence.");
  const output = await geminiService.generateText(input);

  res.status(200).json({
    ok: true,
    model: geminiService.DEFAULT_MODEL,
    input,
    output,
  });
}

module.exports = { ping };
