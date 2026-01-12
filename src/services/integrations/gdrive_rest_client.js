const https = require("https");
const { URLSearchParams } = require("url");

const {
  gdriveClientId,
  gdriveClientSecret,
  gdriveRefreshToken,
} = require("../../config/env");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_HOST = "www.googleapis.com";

function httpPostFormUrlEncoded(url, bodyObj) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(new URLSearchParams(bodyObj).toString(), "utf8");
    const u = new URL(url);

    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": data.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(text));
            } catch {
              resolve(text);
            }
            return;
          }

          const e = new Error(
            `Token request failed: ${res.statusCode} ${text}`
          );
          e.statusCode = res.statusCode || 500;
          reject(e);
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

let cachedToken = null; // { accessToken, expMs }

async function getAccessToken() {
  if (cachedToken && cachedToken.expMs > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  try {
    const tokenRes = await httpPostFormUrlEncoded(TOKEN_URL, {
      client_id: gdriveClientId,
      client_secret: gdriveClientSecret,
      refresh_token: gdriveRefreshToken,
      grant_type: "refresh_token",
    });

    const accessToken = tokenRes.access_token;
    const expiresIn = Number(tokenRes.expires_in || 3600);

    if (!accessToken) {
      throw new Error(`Missing access_token: ${JSON.stringify(tokenRes)}`);
    }

    cachedToken = {
      accessToken,
      expMs: Date.now() + expiresIn * 1000,
    };

    return accessToken;
  } catch (err) {
    // ⭐ CRITICAL PART
    if (
      err.message?.includes("invalid_grant") ||
      err.message?.includes("expired or revoked")
    ) {
      const e = new Error(
        "Google Drive refresh_token is invalid or revoked. Re-authentication required."
      );
      e.code = "GDRIVE_REFRESH_TOKEN_INVALID";
      e.statusCode = 500;
      throw e;
    }

    throw err;
  }
}

async function driveRequest({ method, path, headers = {}, body }) {
  const accessToken = await getAccessToken();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        hostname: DRIVE_API_HOST,
        path,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            if (!text) return resolve(null);
            try {
              resolve(JSON.parse(text));
            } catch {
              resolve(text);
            }
            return;
          }

          const e = new Error(`Drive API failed: ${res.statusCode} ${text}`);
          e.statusCode = res.statusCode || 500;
          reject(e);
        });
      }
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function escapeDriveQueryValue(v) {
  // Drive query dùng dấu nháy đơn. Escape nhẹ để tránh break query.
  return String(v).replace(/'/g, "\\'");
}

/**
 * Upload buffer (multipart) → Drive folder
 */
async function uploadBufferToDrive({
  fileName,
  mimeType,
  buffer,
  folderId,
  supportsAllDrives = false,
}) {
  const boundary = `----nodeboundary${Date.now()}`;
  const metadata = {
    name: fileName,
    parents: folderId ? [folderId] : undefined,
  };

  const part1 =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`;

  const part2 = `--${boundary}\r\n` + `Content-Type: ${mimeType}\r\n\r\n`;

  const closing = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(part1, "utf8"),
    Buffer.from(part2, "utf8"),
    buffer,
    Buffer.from(closing, "utf8"),
  ]);

  const qs = new URLSearchParams({
    uploadType: "multipart",
    fields: "id,name,createdTime,size",
  });

  if (supportsAllDrives) qs.set("supportsAllDrives", "true");

  const uploadPath = `/upload/drive/v3/files?${qs.toString()}`;

  return driveRequest({
    method: "POST",
    path: uploadPath,
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  });
}

/**
 * List files in a folder (for retention/prune)
 */
async function listFilesInFolder({
  folderId,
  nameContains,
  pageSize = 200,
  supportsAllDrives = false,
}) {
  if (!folderId) {
    const e = new Error("Missing folderId");
    e.statusCode = 500;
    throw e;
  }

  const safeFolder = escapeDriveQueryValue(folderId);
  let q = `'${safeFolder}' in parents and trashed = false`;

  if (nameContains) {
    const safeName = escapeDriveQueryValue(nameContains);
    q += ` and name contains '${safeName}'`;
  }

  const files = [];
  let pageToken = null;

  do {
    const qs = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,createdTime,size)",
      pageSize: String(pageSize),
    });

    if (pageToken) qs.set("pageToken", pageToken);

    if (supportsAllDrives) {
      qs.set("supportsAllDrives", "true");
      qs.set("includeItemsFromAllDrives", "true");
    }

    const res = await driveRequest({
      method: "GET",
      path: `/drive/v3/files?${qs.toString()}`,
    });

    if (res?.files?.length) files.push(...res.files);
    pageToken = res?.nextPageToken || null;
  } while (pageToken);

  return files;
}

/**
 * Delete a Drive file by id
 */
async function deleteDriveFile({ fileId, supportsAllDrives = false }) {
  if (!fileId) {
    const e = new Error("Missing fileId");
    e.statusCode = 500;
    throw e;
  }

  const qs = new URLSearchParams();
  if (supportsAllDrives) qs.set("supportsAllDrives", "true");

  const p = qs.toString()
    ? `/drive/v3/files/${encodeURIComponent(fileId)}?${qs.toString()}`
    : `/drive/v3/files/${encodeURIComponent(fileId)}`;

  await driveRequest({ method: "DELETE", path: p });
  return { ok: true };
}

module.exports = {
  uploadBufferToDrive,
  listFilesInFolder,
  deleteDriveFile,
};
