const { backupHour, backupMinute } = require("../config/env");
const { runDriveBackup } = require("../services/admin/backup_service");

let timer = null;
let isRunning = false;

function msUntilNextRun() {
  const now = new Date();

  const next = new Date(now);
  next.setHours(backupHour, backupMinute, 0, 0);

  if (next <= now) next.setDate(next.getDate() + 1);

  const diff = next.getTime() - now.getTime();
  return Math.max(1000, diff); // tránh 0ms / negative
}

function fmt(d) {
  // log theo timezone của process (phụ thuộc TZ env)
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

async function safeRun() {
  if (isRunning) {
    console.warn("[BACKUP] skipped (previous run still running)");
    return;
  }

  isRunning = true;
  try {
    const result = await runDriveBackup();
    console.log(
      "[BACKUP] OK:",
      result.fileName,
      result.fileId,
      `size=${result.size}`
    );
  } catch (e) {
    console.error("[BACKUP] FAILED:", e?.message || e);
    if (e?.stack) console.error(e.stack);
  } finally {
    isRunning = false;
  }
}

function scheduleNext() {
  const delay = msUntilNextRun();

  const now = new Date();
  const next = new Date(now.getTime() + delay);

  console.log(
    `[BACKUP] next run in ${Math.round(delay / 1000)}s at ${fmt(
      next
    )} (server TZ=${process.env.TZ || "system"})`
  );

  timer = setTimeout(async () => {
    await safeRun();
    scheduleNext(); // schedule again
  }, delay);
}

function startDailyBackupJob() {
  if (timer) clearTimeout(timer);
  scheduleNext();
}

module.exports = { startDailyBackupJob };
