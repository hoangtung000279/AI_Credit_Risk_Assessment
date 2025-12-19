function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function annuityPrincipalFromPayment({ payment, annualRate, months }) {
  const pmt = Number(payment);
  const n = Number(months);
  const r = Number(annualRate) / 100 / 12;

  if (!Number.isFinite(pmt) || pmt <= 0 || !Number.isFinite(n) || n <= 0)
    return 0;
  if (!Number.isFinite(r) || r <= 0) return pmt * n;

  // P = PMT * (1 - (1+r)^-n) / r
  const factor = (1 - Math.pow(1 + r, -n)) / r;
  return pmt * factor;
}

function buildLoanTerms(input, riskResult) {
  const monthlyIncome = Number(input.monthlyIncome);
  const monthlyDebtPayment = Number(input.monthlyDebtPayment);
  const disposable = Number.isFinite(monthlyIncome)
    ? monthlyIncome -
      (Number.isFinite(monthlyDebtPayment) ? monthlyDebtPayment : 0)
    : 0;

  // Cap trả góp/tháng: min(30% income, 80% disposable), không âm
  const paymentCap = clamp(
    Math.min(monthlyIncome * 0.3, disposable * 0.8),
    0,
    Number.MAX_SAFE_INTEGER
  );

  const score = Number(riskResult.finalScore);

  // Decision + terms theo score (MVP, đơn giản và “defensible”)
  let decision = "review"; // approve | review | reject
  let interestRateAnnual = 18;
  let tenureMonths = 12;

  if (score >= 75) {
    decision = "approve";
    interestRateAnnual = 12;
    tenureMonths = 18;
  } else if (score >= 50) {
    decision = "review";
    interestRateAnnual = 16;
    tenureMonths = 12;
  } else {
    decision = "reject";
    interestRateAnnual = 0;
    tenureMonths = 0;
  }

  // Optional: ưu đãi nhẹ nếu FPO tốt (đừng “double count” quá mạnh)
  if (
    decision !== "reject" &&
    input.isFpoMember &&
    String(input.fpoTrackRecord || "").toLowerCase() === "good"
  ) {
    interestRateAnnual = Math.max(10, interestRateAnnual - 1);
  }

  let recommendedAmount = 0;
  let estimatedMonthlyPayment = 0;

  if (decision !== "reject" && paymentCap > 0) {
    recommendedAmount = annuityPrincipalFromPayment({
      payment: paymentCap,
      annualRate: interestRateAnnual,
      months: tenureMonths,
    });

    // Làm tròn “đẹp” cho demo
    recommendedAmount = Math.floor(recommendedAmount / 10) * 10;

    // Ước lượng lại PMT từ principal (để trả về)
    // (nhanh: dùng paymentCap như ước lượng)
    estimatedMonthlyPayment = Math.round(paymentCap);
  }

  return {
    decision,
    recommendedAmount,
    interestRateAnnual,
    tenureMonths,
    estimatedMonthlyPayment,
    paymentCap: Math.round(paymentCap),
    notes: [
      "MVP terms: based on score + repayment capacity cap.",
      "Final decision can be overridden by loan officer in Phase 2.",
    ],
  };
}

module.exports = { buildLoanTerms };
