const { assessRisk } = require("../services/risk_assessment_service");

function validateInput(body) {
  // MVP validate tối thiểu, tránh crash
  const required = [
    "repaymentHistory",
    "monthlyIncome",
    "monthlyDebtPayment",
    "businessYears",
    "hasCollateral",
  ];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null) {
      const err = new Error(`Missing required field: ${key}`);
      err.statusCode = 400;
      throw err;
    }
  }
}

async function assess(req, res) {
  validateInput(req.body || {});
  const result = await assessRisk(req.body);

  res.status(200).json({
    ok: true,
    ...result,
    explainable: {
      base: "Base score computed from 5 transparent factors.",
      finalFormula: "final = base + aiAdjustment + fpoBoost (capped 0..100)",
    },
  });
}

module.exports = { assess };
