const { runDriveBackup } = require("../../services/admin/backup_service");
const { adminExportKey } = require("../../config/env");

async function run(req, res) {
  const startedAt = Date.now();

  // ✅ MVP protection: x-admin-key
  const key = req.header("key") || req.query.key;
  if (!adminExportKey || key !== adminExportKey) {
    return res.status(401).json({
      ok: false,
      message: "Unauthorized",
      meta: { latencyMs: Date.now() - startedAt },
    });
  }

  try {
    const result = await runDriveBackup();

    return res.status(200).json({
      ok: true,
      ...result,
      meta: { latencyMs: Date.now() - startedAt },
    });
  } catch (e) {
    const status =
      e?.statusCode && Number.isFinite(e.statusCode) ? e.statusCode : 500;

    return res.status(status).json({
      ok: false,
      message: e?.message || "Backup failed",
      meta: { latencyMs: Date.now() - startedAt },
    });
  }
}

module.exports = { run };
