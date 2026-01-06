const { port } = require("./config/env");
const { createApp } = require("./app");
const { connectMongo } = require("./config/mongo_client");
const { ensureMongoIndexes } = require("./config/mongo_indexes");
const { startDailyBackupJob } = require("./jobs/daily_backup_job");

async function main() {
  await connectMongo();
  await ensureMongoIndexes();
  startDailyBackupJob();

  const fs = require("fs");
  console.log(
    "[Backup] key exists:",
    fs.existsSync(process.env.GDRIVE_KEY_FILE)
  );

  const app = createApp();

  app.listen(port, "0.0.0.0", () => {
    console.log(`API running on port ${port}`);
  });
}

main().catch((err) => {
  console.error("[BOOT] failed to start:", err);
  process.exit(1);
});
