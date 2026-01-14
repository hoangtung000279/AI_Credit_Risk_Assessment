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

  const y = doc.y; // ✅ đảm bảo cùng 1 hàng
  doc.font("Helvetica-Bold").text(label, x, y, { width: w * 0.45 });
  doc.font("Helvetica").text(String(value ?? ""), x + w * 0.45, y, {
    width: w * 0.55,
    align: "right",
  });

  doc.moveDown(0.4);
}

function drawSimpleTable(doc, { headers, rows, colWidths }) {
  const x = doc.page.margins.left;
  const usableW =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const widths =
    colWidths && colWidths.length === headers.length
      ? colWidths
      : Array(headers.length).fill(usableW / headers.length);

  doc.font("Helvetica-Bold");
  let cx = x;
  const y0 = doc.y;
  headers.forEach((h, i) => {
    doc.text(h, cx, y0, { width: widths[i] });
    cx += widths[i];
  });

  doc.moveDown(0.6);
  doc
    .moveTo(x, doc.y)
    .lineTo(x + usableW, doc.y)
    .strokeColor("#ccc")
    .stroke();
  doc.moveDown(0.5);

  doc.font("Helvetica");
  for (const r of rows) {
    cx = x;
    const y = doc.y;
    r.forEach((cell, i) => {
      doc.text(String(cell ?? ""), cx, y, { width: widths[i] });
      cx += widths[i];
    });
    doc.moveDown(0.45);
  }

  doc.moveDown(0.3);
}

module.exports = { drawSectionTitle, drawKeyValueRow, drawSimpleTable };
