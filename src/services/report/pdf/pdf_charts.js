const { asNum } = require("./pdf_helpers");
const { drawSectionTitle } = require("./pdf_tables");

function drawGrowthChart(
  doc,
  points,
  { title = "Growth (Daily Assessments)" } = {}
) {
  drawSectionTitle(doc, title);

  // ✅ Prevent page-break glitches: ensure we have space for the chart block
  const needed = 160 + 40; // chart height + x-label + gap
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }

  if (!Array.isArray(points) || points.length < 2) {
    doc.text("Not enough data to draw chart.");
    return;
  }

  const sum = points.reduce((s, p) => s + asNum(p?.count, 0), 0);
  if (sum === 0) {
    doc.text("No assessments found in selected period.");
    return;
  }

  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = 160;
  const y = doc.y;

  doc.rect(x, y, w, h).strokeColor("#ddd").lineWidth(1).stroke();

  const padding = 24;
  const ix = x + padding;
  const iy = y + padding;
  const iw = w - padding * 2;
  const ih = h - padding * 2;

  const maxY = Math.max(...points.map((p) => asNum(p.count, 0)), 1);
  const minY = 0;

  doc
    .moveTo(ix, iy)
    .lineTo(ix, iy + ih)
    .lineTo(ix + iw, iy + ih)
    .strokeColor("#666")
    .lineWidth(1)
    .stroke();

  doc.fontSize(9).fillColor("#333");
  doc.text(String(maxY), x, iy - 5, { width: padding - 4, align: "right" });
  doc.text("0", x, iy + ih - 5, { width: padding - 4, align: "right" });

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

  const first = points[0]?.day;
  const last = points[points.length - 1]?.day;
  doc.fontSize(9).fillColor("#333");
  doc.text(String(first ?? ""), ix, iy + ih + 6, { width: 90 });
  doc.text(String(last ?? ""), ix + iw - 90, iy + ih + 6, {
    width: 90,
    align: "right",
  });

  // ✅ FIX: set doc.y xuống đúng dưới chart, không moveDown lớn
  doc.fillColor("#000").fontSize(11);
  doc.y = Math.max(doc.y, y + h + 18);
}

module.exports = { drawGrowthChart };
