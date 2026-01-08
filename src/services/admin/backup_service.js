// src/services/admin/backup_service.js
const zlib = require("zlib");
const { getDb } = require("../../config/db/mongo_client");
const {
  gdriveFolderId,
  backupAnonymize,
  backupRetentionDays,
} = require("../../config/env");

const {
  uploadBufferToDrive,
  listFilesInFolder,
  deleteDriveFile,
} = require("../integrations/gdrive_rest_client");

// =========================
// Helpers
// =========================
function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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
  // ✅ no PII: chỉ allow fields phục vụ analytics/model
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
    if (input && Object.prototype.hasOwnProperty.call(input, k)) {
      out[k] = input[k];
    }
  }
  return out;
}

function ymd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseBackupDateFromName(name) {
  const m = String(name || "").match(
    /assessments-backup-(\d{4}-\d{2}-\d{2})\.json\.gz$/i
  );
  return m ? m[1] : null; // YYYY-MM-DD
}

function ensureDriveFolder() {
  if (!gdriveFolderId) {
    const e = new Error("Missing GDRIVE_FOLDER_ID");
    e.statusCode = 500;
    throw e;
  }
}

// =========================
// Build payload (MongoDB -> JSON)
// =========================
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

// =========================
// Drive operations
// =========================
async function pruneOldBackups() {
  ensureDriveFolder();

  // Default giữ 30 ngày nếu env chưa có
  const retention = asNum(backupRetentionDays, 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retention);

  const files = await listFilesInFolder({
    folderId: gdriveFolderId,
    nameContains: "assessments-backup-",
  });

  for (const f of Array.isArray(files) ? files : []) {
    const name = f?.name || "";
    const dateStr = parseBackupDateFromName(name);
    if (!dateStr) continue;

    const fileDate = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(fileDate.getTime())) continue;

    if (fileDate < cutoff && f?.id) {
      await deleteDriveFile({ fileId: f.id });
    }
  }
}

async function listBackups({ limit = 20 } = {}) {
  ensureDriveFolder();

  const files = await listFilesInFolder({
    folderId: gdriveFolderId,
    nameContains: "assessments-backup-",
  });

  const items = (Array.isArray(files) ? files : [])
    .map((f) => {
      const name = f?.name || "";
      const date = parseBackupDateFromName(name);

      return {
        id: f?.id || null,
        name,
        backupDate: date, // YYYY-MM-DD (from filename)
        createdTime: f?.createdTime || null,
        size: f?.size != null ? asNum(f.size, null) : null,
        mimeType: f?.mimeType || null,
        // nếu gdrive_rest_client trả webViewLink/webContentLink thì giữ lại
        webViewLink: f?.webViewLink || null,
        webContentLink: f?.webContentLink || null,
      };
    })
    .filter((x) => x.id && x.backupDate) // chỉ giữ file đúng pattern
    // sort mới nhất -> cũ nhất
    .sort((a, b) => String(b.backupDate).localeCompare(String(a.backupDate)))
    .slice(0, Math.max(1, asNum(limit, 20)));

  return {
    folderId: gdriveFolderId,
    retentionDays: asNum(backupRetentionDays, 30),
    anonymized: Boolean(backupAnonymize),
    items,
  };
}

async function getBackupStatus() {
  ensureDriveFolder();

  let latest = null;
  try {
    const { items } = await listBackups({ limit: 1 });
    latest = items?.[0] ?? null;
  } catch {
    // ignore -> status vẫn trả được config
  }

  return {
    folderId: gdriveFolderId,
    retentionDays: asNum(backupRetentionDays, 30),
    anonymized: Boolean(backupAnonymize),
    latestBackup: latest,
  };
}

async function runDriveBackup() {
  ensureDriveFolder();

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
    fileId: uploaded?.id || null,
    fileName: uploaded?.name || fileName,
    size:
      uploaded?.size != null
        ? asNum(uploaded.size, gzBuf.length)
        : gzBuf.length,
    createdTime: uploaded?.createdTime || null,
    total: payload.total,
    anonymized: payload.anonymized,
  };
}

module.exports = { runDriveBackup, listBackups, getBackupStatus };
