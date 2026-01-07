const { port } = require("./config/env");
const { createApp } = require("./app");
const { connectMongo, closeMongo } = require("./config/db/mongo_client");
const { ensureMongoIndexes } = require("./config/db/mongo_indexes");
const { startDailyBackupJob } = require("./jobs/daily_backup_job");

async function main() {
  await connectMongo();
  await ensureMongoIndexes();
  startDailyBackupJob();

  const app = createApp();

  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`[BOOT] API running on port ${port}`);
  });

  // ✅ Timeouts (Node.js HTTP)
  server.requestTimeout = 15_000; // tổng thời gian xử lý req
  server.headersTimeout = 20_000; // headers timeout > requestTimeout
  server.keepAliveTimeout = 5_000;

  const shutdown = async (signal) => {
    console.log(`[BOOT] Shutdown signal received: ${signal}`);
    try {
      await new Promise((resolve) => server.close(resolve));
      await closeMongo().catch(() => null);
      console.log("[BOOT] Shutdown complete");
      process.exit(0);
    } catch (e) {
      console.error("[BOOT] Shutdown failed:", e?.message || e);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
    // crash có kiểm soát để tránh state hỏng
    shutdown("uncaughtException");
  });
}

main().catch((err) => {
  console.error("[BOOT] failed to start:", err);
  process.exit(1);
});
