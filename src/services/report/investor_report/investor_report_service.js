const { buildInvestorReportData } = require("./investor_report_data");
const { renderInvestorPdf } = require("./investor_report_render");

async function generateInvestorReportPdf({ from, to } = {}) {
  const data = await buildInvestorReportData({ from, to });
  const doc = renderInvestorPdf({ data });
  return { doc, data };
}

module.exports = { generateInvestorReportPdf };
