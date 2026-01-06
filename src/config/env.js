require("dotenv").config();

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || "";
const mongoDbName = process.env.MONGODB_DB || "credit_risk";

// ✅ Google Drive (OAuth2 - personal Gmail)
const gdriveFolderId = process.env.GDRIVE_FOLDER_ID || "";

const adminExportKey = process.env.ADMIN_EXPORT_KEY || "";

const gdriveClientId = process.env.GDRIVE_CLIENT_ID || "";
const gdriveClientSecret = process.env.GDRIVE_CLIENT_SECRET || "";
const gdriveRefreshToken = process.env.GDRIVE_REFRESH_TOKEN || "";

// (optional) giữ lại keyFile nếu sau này bạn dùng Shared Drive/Workspace,
// nhưng với Gmail cá nhân thì KHÔNG dùng.
const gdriveKeyFile = process.env.GDRIVE_KEY_FILE || "";

const backupHour = Number(process.env.BACKUP_HOUR ?? 0);
const backupMinute = Number(process.env.BACKUP_MINUTE ?? 5);
const backupAnonymize =
  String(process.env.BACKUP_ANONYMIZE ?? "true") === "true";

// ✅ Minimal validation (fail fast)
function assertEnv(condition, message) {
  if (!condition) throw new Error(`[env] ${message}`);
}

assertEnv(mongoUri, "Missing MONGODB_URI");
assertEnv(gdriveFolderId, "Missing GDRIVE_FOLDER_ID");

// Với Gmail cá nhân: bắt buộc OAuth2
assertEnv(gdriveClientId, "Missing GDRIVE_CLIENT_ID");
assertEnv(gdriveClientSecret, "Missing GDRIVE_CLIENT_SECRET");
assertEnv(gdriveRefreshToken, "Missing GDRIVE_REFRESH_TOKEN");

module.exports = {
  port,
  mongoUri,
  mongoDbName,

  // ⛔️ Không dùng cho My Drive cá nhân (giữ lại nếu bạn muốn switch sang Shared Drive sau)
  gdriveKeyFile,

  // ✅ dùng OAuth2
  gdriveFolderId,
  gdriveClientId,
  gdriveClientSecret,
  gdriveRefreshToken,

  backupHour,
  backupMinute,
  backupAnonymize,
  adminExportKey,
};
