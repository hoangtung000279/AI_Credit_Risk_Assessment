function badRequest(message, details) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = "BAD_REQUEST";
  if (details) err.details = details;
  return err;
}

module.exports = function validateAssess(req, _res, next) {
  const body = req.body || {};
  const details = [];

  const location = String(body.location || "").trim();
  if (!location) details.push({ field: "location", issue: "required" });

  const monthlyIncome = Number(body.monthlyIncome);
  if (!Number.isFinite(monthlyIncome) || monthlyIncome < 0) {
    details.push({ field: "monthlyIncome", issue: "must be >= 0 number" });
  }

  const monthlyDebtPayment = Number(body.monthlyDebtPayment);
  if (!Number.isFinite(monthlyDebtPayment) || monthlyDebtPayment < 0) {
    details.push({ field: "monthlyDebtPayment", issue: "must be >= 0 number" });
  }

  const cropsRaw = Array.isArray(body.crops)
    ? body.crops
    : body.crops
    ? [body.crops]
    : [];

  const crops = cropsRaw.map((x) => String(x || "").trim()).filter(Boolean);
  if (crops.length === 0) details.push({ field: "crops", issue: "required" });

  if (details.length)
    return next(badRequest("Invalid assessment input", details));
  return next();
};
