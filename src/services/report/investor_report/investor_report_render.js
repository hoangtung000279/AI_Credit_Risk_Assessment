const PDFDocument = require("pdfkit");
const { pct, asNum } = require("../pdf/pdf_helpers");
const {
  drawSectionTitle,
  drawKeyValueRow,
  drawSimpleTable,
} = require("../pdf/pdf_tables");
const { drawGrowthChart } = require("../pdf/pdf_charts");

function renderInvestorPdf({ data }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: "Investor Report", Author: "AI Credit Risk Assessment" },
  });

  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("Investor Report", { align: "left" });

  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(11).fillColor("#444");
  doc.text("AI Credit Risk Assessment – Aggregated & Anonymized");
  doc.text(`Generated at: ${data.generatedAt}`);
  if (data.dateRange.from || data.dateRange.to) {
    doc.text(
      `Data range: ${data.dateRange.from ?? "?"} → ${data.dateRange.to ?? "?"}`
    );
  }
  doc.fillColor("#000");

  drawSectionTitle(doc, "Overview");
  drawKeyValueRow(doc, "Total assessments", data.total);

  drawSectionTitle(doc, "Geographic spread (Top provinces)");
  drawSimpleTable(doc, {
    headers: ["Province", "Assessments"],
    rows: (data.geo ?? []).map((x) => [
      x.province ?? "Unknown",
      asNum(x.count, 0),
    ]),
    colWidths: [320, 140],
  });

  drawSectionTitle(doc, "Risk distribution");
  const riskTotal =
    asNum(data.risk.low) +
    asNum(data.risk.medium) +
    asNum(data.risk.high) +
    asNum(data.risk.unknown);

  drawSimpleTable(doc, {
    headers: ["Bucket", "Count", "Share"],
    rows: [
      ["Low Risk", asNum(data.risk.low), pct(asNum(data.risk.low), riskTotal)],
      [
        "Medium Risk",
        asNum(data.risk.medium),
        pct(asNum(data.risk.medium), riskTotal),
      ],
      [
        "High Risk",
        asNum(data.risk.high),
        pct(asNum(data.risk.high), riskTotal),
      ],
      [
        "Unknown",
        asNum(data.risk.unknown),
        pct(asNum(data.risk.unknown), riskTotal),
      ],
    ],
    colWidths: [220, 120, 120],
  });

  drawSectionTitle(doc, "FPO impact (Aggregated)");
  const memberAvg = asNum(data.fpoImpact.member.avgFinalScore, 0);
  const nonCount = asNum(data.fpoImpact.nonMember.count, 0);
  const nonAvg = asNum(data.fpoImpact.nonMember.avgFinalScore, 0);
  const delta = nonCount > 0 ? memberAvg - nonAvg : null;

  drawSimpleTable(doc, {
    headers: ["Group", "Count", "Avg final score"],
    rows: [
      ["FPO member", data.fpoImpact.member.count, memberAvg.toFixed(1)],
      [
        "Non-member",
        data.fpoImpact.nonMember.count,
        nonCount > 0 ? nonAvg.toFixed(1) : "N/A",
      ],
      [
        "Delta (member - non)",
        "",
        delta == null ? "N/A" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`,
      ],
    ],
    colWidths: [220, 120, 120],
  });

  drawGrowthChart(doc, data.growth, { title: "Growth chart (last 30 days)" });

  doc.moveDown(0.8);
  doc.fontSize(9).fillColor("#666");
  doc.text(
    "Note: This report contains aggregated metrics only. No personally identifiable information (PII) is included.",
    { align: "left" }
  );
  doc.fillColor("#000");

  return doc;
}

module.exports = { renderInvestorPdf };
