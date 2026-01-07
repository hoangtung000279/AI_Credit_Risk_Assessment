const { MongoClient, ServerApiVersion } = require("mongodb");
const { mongoUri, mongoDbName } = require("../env");

let client;
let db;

/**
 * Connect MongoDB once (idempotent).
 * Keep it lightweight: connect + ping only.
 * Indexes should be handled by ensureMongoIndexes() (separate module).
 */
async function connectMongo() {
  if (db) return db;

  if (!mongoUri) {
    const err = new Error("Missing MONGODB_URI");
    err.statusCode = 500;
    err.code = "MISSING_MONGODB_URI";
    throw err;
  }

  client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    // Optional: tune for stability; keep conservative
    // maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 10),
  });

  await client.connect();

  db = client.db(mongoDbName);

  // ping to ensure connection ok
  await db.command({ ping: 1 });
  console.log(`[MongoDB] Connected to DB: ${mongoDbName}`);

  return db;
}

function getDb() {
  if (!db) {
    const err = new Error("MongoDB not connected yet");
    err.statusCode = 500;
    err.code = "MONGODB_NOT_CONNECTED";
    throw err;
  }
  return db;
}

/**
 * Graceful shutdown support (BE-303)
 */
async function closeMongo() {
  try {
    if (client) {
      await client.close();
      client = undefined;
      db = undefined;
      console.log("[MongoDB] Connection closed");
    }
  } catch (e) {
    console.error("[MongoDB] close failed:", e?.message || e);
  }
}

module.exports = { connectMongo, getDb, closeMongo };
