// src/controllers/admin_backup_controller.js
const backupService = require("../../services/admin/backup_service");
const { adminExportKey } = require("../../config/env");

function readAdminKey(req) {
  // support cả 3 cách để khỏi vỡ client cũ
  return req.header("x-admin-key") || req.header("key") || req.query.key;
}

function ensureAdmin(req, res, startedAt) {
  const key = readAdminKey(req);
  if (!adminExportKey || key !== adminExportKey) {
    res.status(401).json({
      ok: false,
      message: "Unauthorized",
      meta: { latencyMs: Date.now() - startedAt },
    });
    return false;
  }
  return true;
}

function requireFn(obj, name) {
  const fn = obj?.[name];
  if (typeof fn !== "function") {
    const err = new Error(`[backup_service] Missing function: ${name}()`);
    err.statusCode = 500;
    err.code = "MISCONFIG";
    throw err;
  }
  return fn;
}

// POST /api/v1/backup/run
async function run(req, res) {
  const startedAt = Date.now();
  if (!ensureAdmin(req, res, startedAt)) return;

  try {
    const runDriveBackup = requireFn(backupService, "runDriveBackup");
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

// GET /api/v1/backup/status
async function status(req, res) {
  const startedAt = Date.now();
  if (!ensureAdmin(req, res, startedAt)) return;

  try {
    const getBackupStatus = requireFn(backupService, "getBackupStatus");
    const result = await getBackupStatus();

    return res.status(200).json({
      ok: true,
      ...result,
      meta: { latencyMs: Date.now() - startedAt },
    });
  } catch (e) {
    const statusCode =
      e?.statusCode && Number.isFinite(e.statusCode) ? e.statusCode : 500;

    return res.status(statusCode).json({
      ok: false,
      message: e?.message || "Get backup status failed",
      meta: { latencyMs: Date.now() - startedAt },
    });
  }
}

// GET /api/v1/backup/list
async function list(req, res) {
  const startedAt = Date.now();
  if (!ensureAdmin(req, res, startedAt)) return;

  try {
    const listBackups = requireFn(backupService, "listBackups");
    const result = await listBackups();

    return res.status(200).json({
      ok: true,
      ...result,
      meta: { latencyMs: Date.now() - startedAt },
    });
  } catch (e) {
    const statusCode =
      e?.statusCode && Number.isFinite(e.statusCode) ? e.statusCode : 500;

    return res.status(statusCode).json({
      ok: false,
      message: e?.message || "List backups failed",
      meta: { latencyMs: Date.now() - startedAt },
    });
  }
}

module.exports = { run, status, list };
