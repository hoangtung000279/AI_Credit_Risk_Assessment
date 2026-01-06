const PDFDocument = require("pdfkit");
const assessmentRepo = require("../../repositories/assessment_repo");

// =========================
// Helpers
// =========================
function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Normalize "day" key to YYYY-MM-DD (no time).
 * - If already YYYY-MM-DD -> keep
 * - If Date/ISO -> convert to local date key
 */
function normalizeDayKey(v) {
  if (!v) return null;

  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // if ISO-like string, parse
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
        d.getDate()
      )}`;
    }
    return null;
  }

  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateParam(v, { endOfDay = false } = {}) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;

  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);

  return d;
}

function buildLastNDaysSeries(byDay, { days = 30, to } = {}) {
  const end = parseDateParam(to, { endOfDay: true }) ?? new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  // normalize map keys => YYYY-MM-DD
  const map = new Map();
  for (const x of Array.isArray(byDay) ? byDay : []) {
    const k = normalizeDayKey(x?.day);
    if (!k) continue;
    const prev = asNum(map.get(k), 0);
    map.set(k, prev + asNum(x?.count, 0));
  }

  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    const k = normalizeDayKey(cur);
    out.push({ day: k, count: asNum(map.get(k), 0) });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// =========================
// PDF drawing
// =========================
function drawSectionTitle(doc, text) {
  doc.moveDown(0.6);
  doc.fontSize(14).font("Helvetica-Bold").text(text);
  doc.moveDown(0.2);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#999")
    .stroke();
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(11);
}

function drawKeyValueRow(doc, label, value) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font("Helvetica-Bold").text(label, x, doc.y, { width: w * 0.45 });
  doc.font("Helvetica").text(String(value ?? ""), x + w * 0.45, doc.y - 12, {
    width: w * 0.55,
    align: "right",
  });
  doc.moveDown(0.2);
}

function drawSimpleTable(doc, { headers, rows, colWidths }) {
  const x = doc.page.margins.left;
  const usableW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const widths =
    colWidths && colWidths.length === headers.length
      ? colWidths
      : Array(headers.length).fill(usableW / headers.length);

  // header
  doc.font("Helvetica-Bold");
  let cx = x;
  const y0 = doc.y;
  headers.forEach((h, i) => {
    doc.text(h, cx, y0, { width: widths[i], continued: false });
    cx += widths[i];
  });

  doc.moveDown(0.5);
  doc
    .moveTo(x, doc.y)
    .lineTo(x + usableW, doc.y)
    .strokeColor("#ccc")
    .stroke();
  doc.moveDown(0.4);

  // rows
  doc.font("Helvetica");
  for (const r of rows) {
    cx = x;
    const y = doc.y;
    r.forEach((cell, i) => {
      doc.text(String(cell ?? ""), cx, y, { width: widths[i] });
      cx += widths[i];
    });
    doc.moveDown(0.4);
  }
  doc.moveDown(0.2);
}

function drawGrowthChart(
  doc,
  points,
  { title = "Growth (Daily Assessments)" } = {}
) {
  drawSectionTitle(doc, title);

  if (!Array.isArray(points) || points.length < 2) {
    doc.text("Not enough data to draw chart.");
    return;
  }

  const sum = points.reduce((s, p) => s + asNum(p?.count, 0), 0);
  if (sum === 0) {
    doc.text("No assessments found in selected period.");
    return;
  }

  // chart box
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = 160;
  const y = doc.y;

  doc.rect(x, y, w, h).strokeColor("#ddd").stroke();

  const padding = 24;
  const ix = x + padding;
  const iy = y + padding;
  const iw = w - padding * 2;
  const ih = h - padding * 2;

  const maxY = Math.max(...points.map((p) => asNum(p.count, 0)), 1);
  const minY = 0;

  // axes
  doc
    .moveTo(ix, iy)
    .lineTo(ix, iy + ih)
    .lineTo(ix + iw, iy + ih)
    .strokeColor("#666")
    .stroke();

  // y labels
  doc.fontSize(9).fillColor("#333");
  doc.text(String(maxY), x, iy - 5, { width: padding - 4, align: "right" });
  doc.text("0", x, iy + ih - 5, { width: padding - 4, align: "right" });

  // polyline
  const stepX = iw / (points.length - 1);
  const toX = (i) => ix + i * stepX;
  const toY = (v) => iy + ih - ((v - minY) / (maxY - minY)) * ih;

  doc.strokeColor("#1f77b4").lineWidth(2);
  points.forEach((p, i) => {
    const px = toX(i);
    const py = toY(asNum(p.count, 0));
    if (i === 0) doc.moveTo(px, py);
    else doc.lineTo(px, py);
  });
  doc.stroke();

  // x labels (first/last)
  const first = points[0]?.day;
  const last = points[points.length - 1]?.day;
  doc.fontSize(9).fillColor("#333");
  doc.text(String(first ?? ""), ix, iy + ih + 6, { width: 80 });
  doc.text(String(last ?? ""), ix + iw - 80, iy + ih + 6, {
    width: 80,
    align: "right",
  });

  // restore
  doc.fillColor("#000").fontSize(11);
  doc.moveDown(9);
}

// =========================
// Data builder (NO PII)
// =========================
async function buildInvestorReportData({ from, to } = {}) {
  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to, { endOfDay: true });

  const match =
    fromDate || toDate
      ? assessmentRepo.buildMatch({ from: fromDate, to: toDate })
      : {};

  // reuse existing aggregates (no PII)
  const stats = await assessmentRepo.aggregateStats({ match });
  const dashboard = await assessmentRepo.aggregateDashboard({
    from: fromDate,
    to: toDate,
  });

  const total = asNum(stats?.totalAssessments, 0);

  const byProvince = Array.isArray(stats?.byProvince) ? stats.byProvince : [];
  const topGeo = byProvince.slice(0, 12);

  const risk = stats?.riskDistribution ?? {
    low: 0,
    medium: 0,
    high: 0,
    unknown: 0,
  };

  const fpoRows = Array.isArray(dashboard?.byFpo) ? dashboard.byFpo : [];
  const fpoMember = fpoRows.find((x) => x._id === "member");
  const fpoNon = fpoRows.find((x) => x._id === "non_member");

  const fpoImpact = {
    member: {
      count: asNum(fpoMember?.count, 0),
      avgFinalScore: asNum(fpoMember?.avgFinalScore, 0),
    },
    nonMember: {
      count: asNum(fpoNon?.count, 0),
      avgFinalScore: asNum(fpoNon?.avgFinalScore, 0),
    },
  };

  const byDay = Array.isArray(dashboard?.byDay) ? dashboard.byDay : [];
  const growth = buildLastNDaysSeries(byDay, {
    days: 30,
    to: toDate ?? new Date(),
  });

  const dateRange = {
    from: fromDate ? normalizeDayKey(fromDate) : growth[0]?.day ?? null,
    to: toDate
      ? normalizeDayKey(toDate)
      : growth[growth.length - 1]?.day ?? null,
  };

  return {
    generatedAt: new Date().toISOString(),
    total,
    dateRange,
    geo: topGeo,
    risk,
    fpoImpact,
    growth,
  };
}

// =========================
// Render PDF
// =========================
function renderInvestorPdf({ data }) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: {
      Title: "Investor Report",
      Author: "AI Credit Risk Assessment",
    },
  });

  // ===== Header =====
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

  // ===== Overview =====
  drawSectionTitle(doc, "Overview");
  drawKeyValueRow(doc, "Total assessments", data.total);

  // ===== Geographic spread =====
  drawSectionTitle(doc, "Geographic spread (Top provinces)");
  drawSimpleTable(doc, {
    headers: ["Province", "Assessments"],
    rows: (data.geo ?? []).map((x) => [
      x.province ?? "Unknown",
      asNum(x.count, 0),
    ]),
    colWidths: [320, 140],
  });

  // ===== Risk distribution =====
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

  // ===== FPO impact =====
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

  // ===== Growth chart =====
  drawGrowthChart(doc, data.growth, { title: "Growth chart (last 30 days)" });

  // ===== Footer note =====
  doc.moveDown(0.8);
  doc.fontSize(9).fillColor("#666");
  doc.text(
    "Note: This report contains aggregated metrics only. No personally identifiable information (PII) is included.",
    { align: "left" }
  );
  doc.fillColor("#000");

  return doc;
}

// =========================
// Public API
// =========================
async function generateInvestorReportPdf({ from, to } = {}) {
  const data = await buildInvestorReportData({ from, to });
  const doc = renderInvestorPdf({ data });
  return { doc, data };
}

module.exports = { generateInvestorReportPdf };
