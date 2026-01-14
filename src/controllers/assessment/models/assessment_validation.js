// src/models/assessment/assessment_validation.js

function validateAssessmentRequest(input) {
  const required = [
    "repaymentHistory",
    "monthlyIncome",
    "monthlyDebtPayment",
    "businessYears",
  ];

  for (const key of required) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      const err = new Error(`Missing required field: ${key}`);
      err.statusCode = 400;
      throw err;
    }
  }

  const allowed = new Set(["excellent", "good", "fair", "poor", "none"]);
  if (!allowed.has(String(input.repaymentHistory || "").toLowerCase())) {
    const err = new Error(
      `repaymentHistory must be one of: ${Array.from(allowed).join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(input.monthlyIncome) || input.monthlyIncome <= 0) {
    const err = new Error("monthlyIncome must be a positive number");
    err.statusCode = 400;
    throw err;
  }

  if (
    !Number.isFinite(input.monthlyDebtPayment) ||
    input.monthlyDebtPayment < 0
  ) {
    const err = new Error("monthlyDebtPayment must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(input.businessYears) || input.businessYears < 0) {
    const err = new Error("businessYears must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }

  // optional but useful: seasonalIncome must be number or null
  if (input.seasonalIncome !== null && !Number.isFinite(input.seasonalIncome)) {
    const err = new Error("seasonalIncome must be a number");
    err.statusCode = 400;
    throw err;
  }
}

module.exports = { validateAssessmentRequest };
