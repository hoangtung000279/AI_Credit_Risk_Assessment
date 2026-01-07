const { google } = require("googleapis");

function getDriveClient() {
  const keyFile = process.env.GDRIVE_KEYFILE;
  if (!keyFile) throw new Error("Missing env: GDRIVE_KEYFILE");

  const auth = new google.auth.GoogleAuth({
    keyFile,
    // Scope đủ để upload + quản lý file trong Drive của service account / folder được share
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

module.exports = { getDriveClient };
