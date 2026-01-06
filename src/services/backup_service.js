const zlib = require("zlib");
const { getDb } = require("../config/mongo_client");
const {
  gdriveFolderId,
  backupAnonymize,
  backupRetentionDays,
} = require("../config/env");

const {
  uploadBufferToDrive,
  listFilesInFolder,
  deleteDriveFile,
} = require("./gdrive_rest_client");

function toPlain(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v._bsontype === "ObjectId" && v.toString) {
    return v.toString();
  }
  if (Array.isArray(v)) return v.map(toPlain);
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = toPlain(val);
    return out;
  }
  return v;
}

function sanitizeFarmerData(input) {
  const allow = [
    "repaymentHistory",
    "monthlyIncome",
    "monthlyDebtPayment",
    "businessYears",
    "hasCollateral",
    "isFpoMember",
    "fpoTrackRecord",
    "location",
    "crops",
  ];
  const out = {};
  for (const k of allow) {
    if (input && Object.prototype.hasOwnProperty.call(input, k))
      out[k] = input[k];
  }
  return out;
}

async function buildBackupPayload() {
  const col = getDb().collection("assessments");

  const cursor = col
    .find(
      {},
      {
        projection: {
          createdAt: 1,
          location: 1,
          farmerData: 1,
          scores: 1,
          reasoning: 1,
          loanTerms: 1,
          analytics: 1,
          aiModel: 1,
          version: 1,
        },
      }
    )
    .sort({ createdAt: -1 });

  const items = [];
  for await (const doc of cursor) {
    const plain = toPlain(doc);

    if (backupAnonymize && plain.farmerData) {
      plain.farmerData = sanitizeFarmerData(plain.farmerData);
    }

    items.push(plain);
  }

  return {
    exportedAt: new Date().toISOString(),
    total: items.length,
    anonymized: Boolean(backupAnonymize),
    items,
  };
}

function ymd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function pruneOldBackups() {
  // Default giữ 30 ngày nếu env chưa có
  const retention = Number(backupRetentionDays || 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retention);

  const files = await listFilesInFolder({
    folderId: gdriveFolderId,
    nameContains: "assessments-backup-",
  });

  for (const f of files) {
    const name = f.name || "";
    const m = name.match(/assessments-backup-(\d{4}-\d{2}-\d{2})\.json\.gz$/);
    if (!m) continue;

    const fileDate = new Date(`${m[1]}T00:00:00Z`);
    if (fileDate < cutoff && f.id) {
      await deleteDriveFile({ fileId: f.id });
    }
  }
}

async function runDriveBackup() {
  if (!gdriveFolderId) {
    const e = new Error("Missing GDRIVE_FOLDER_ID");
    e.statusCode = 500;
    throw e;
  }

  const payload = await buildBackupPayload();
  const jsonBuf = Buffer.from(JSON.stringify(payload), "utf8");

  // ✅ gzip để nhẹ (Drive + network)
  const gzBuf = zlib.gzipSync(jsonBuf, { level: 9 });

  // ✅ naming chuẩn để prune
  const fileName = `assessments-backup-${ymd()}.json.gz`;

  const uploaded = await uploadBufferToDrive({
    fileName,
    mimeType: "application/gzip",
    buffer: gzBuf,
    folderId: gdriveFolderId,
  });

  // ✅ prune sau khi upload thành công
  await pruneOldBackups();

  return {
    fileId: uploaded.id,
    fileName: uploaded.name,
    size: uploaded.size ? Number(uploaded.size) : gzBuf.length,
    createdTime: uploaded.createdTime,
    total: payload.total,
    anonymized: payload.anonymized,
  };
}

module.exports = { runDriveBackup };
