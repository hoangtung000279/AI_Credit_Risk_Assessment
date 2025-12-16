const express = require("express");

const router = express.Router();

router.get("/docs", (_req, res) => {
  res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AI Credit Risk API - Docs</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; max-width: 900px; margin: 0 auto; }
    h1 { margin: 0 0 8px; }
    .card { border: 1px solid #3333; border-radius: 12px; padding: 16px; margin: 16px 0; }
    button { padding: 10px 14px; border-radius: 10px; border: 1px solid #3334; cursor: pointer; }
    textarea { width: 100%; height: 160px; border-radius: 10px; border: 1px solid #3334; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
    pre { background: #0b0b0b; color: #eaeaea; padding: 12px; border-radius: 10px; overflow: auto; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
  </style>
</head>
<body>
  <h1>AI Credit Risk Assessment API</h1>
  <p>Test nhanh trực tiếp trên browser (đúng POST + JSON).</p>

  <div class="card">
    <h2>Health</h2>
    <div class="row">
      <button onclick="openHealth()">Open /health</button>
    </div>
  </div>

  <div class="card">
    <h2>POST /api/ai/ping</h2>
    <textarea id="pingBody">{ "text": "Hello Gemini" }</textarea>
    <div class="row">
      <button onclick="callPing()">Send</button>
    </div>
    <pre id="pingOut">Output...</pre>
  </div>

  <div class="card">
    <h2>POST /api/assess</h2>
    <textarea id="assessBody">{
  "repaymentHistory": "good",
  "monthlyIncome": 1200,
  "monthlyDebtPayment": 300,
  "businessYears": 4,
  "hasCollateral": true,
  "crops": ["rice", "vegetables"],
  "isFpoMember": true,
  "fpoTrackRecord": "good",
  "location": "Can Tho",
  "farmSize": 2.5,
  "seasonalIncome": true
}</textarea>
    <div class="row">
      <button onclick="callAssess()">Send</button>
    </div>
    <pre id="assessOut">Output...</pre>
  </div>

<script>
  function openHealth() {
    window.open("/health", "_blank");
  }

  async function postJson(path, bodyText, outId) {
    const out = document.getElementById(outId);
    out.textContent = "Loading...";
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      out.textContent = "❌ JSON không hợp lệ: " + e.message;
      return;
    }

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      out.textContent = "HTTP " + res.status + "\\n" + JSON.stringify(data, null, 2);
    } catch (e) {
      out.textContent = "❌ Request error: " + e.message;
    }
  }

  function callPing() {
    postJson("/api/ai/ping", document.getElementById("pingBody").value, "pingOut");
  }

  function callAssess() {
    postJson("/api/assess", document.getElementById("assessBody").value, "assessOut");
  }
</script>
</body>
</html>
  `);
});

module.exports = router;
