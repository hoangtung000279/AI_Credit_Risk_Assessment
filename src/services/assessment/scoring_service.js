function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function scoreRepaymentHistory(level) {
  // level: "excellent" | "good" | "fair" | "poor" | "none"
  switch (String(level || "").toLowerCase()) {
    case "excellent":
      return 35;
    case "good":
      return 28;
    case "fair":
      return 20;
    case "poor":
      return 10;
    case "none":
      return 18;
    default:
      return 18;
  }
}

function scoreDebtToIncomeRatio(monthlyDebt, monthlyIncome) {
  const income = Number(monthlyIncome);
  const debt = Number(monthlyDebt);

  const ratio = income > 0 ? (debt / income) * 100 : 999;

  if (ratio < 30) return 30;
  if (ratio < 40) return 26;
  if (ratio < 50) return 22;
  if (ratio < 60) return 18;
  if (ratio < 70) return 14;
  return 8;
}

function scoreBusinessHistory(years) {
  const y = Number(years);
  if (y > 10) return 15;
  if (y >= 5) return 12;
  if (y >= 3) return 9;
  if (y >= 1) return 6;
  return 3;
}

function scoreCollateral(hasCollateral) {
  return hasCollateral ? 10 : 0;
}

function scoreDiversification(crops) {
  if (Array.isArray(crops)) return crops.length >= 2 ? 10 : 5;
  return crops ? 10 : 5;
}

function calculateBaseScore(input) {
  const repaymentHistory = scoreRepaymentHistory(input.repaymentHistory);

  const dti = scoreDebtToIncomeRatio(
    input.monthlyDebtPayment,
    input.monthlyIncome
  );

  const businessHistory = scoreBusinessHistory(input.businessYears);
  const collateral = scoreCollateral(Boolean(input.hasCollateral));
  const diversification = scoreDiversification(
    input.crops ?? input.multipleCrops
  );
  const total =
    repaymentHistory + dti + businessHistory + collateral + diversification;

  return {
    total: clamp(total, 0, 100),
    breakdown: {
      repaymentHistory,
      debtToIncome: dti,
      businessHistory,
      collateral,
      diversification,
    },
    meta: {
      debtToIncomeRatio:
        Number(input.monthlyIncome) > 0
          ? Number(input.monthlyDebtPayment) / Number(input.monthlyIncome)
          : null,
    },
  };
}

module.exports = { calculateBaseScore };
