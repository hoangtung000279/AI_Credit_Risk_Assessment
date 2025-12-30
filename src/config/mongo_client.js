const { MongoClient, ServerApiVersion } = require("mongodb");
const { mongoUri, mongoDbName } = require("./env");

let client;
let db;

async function connectMongo() {
  if (db) return db;

  if (!mongoUri) {
    const err = new Error("Missing MONGODB_URI");
    err.statusCode = 500;
    throw err;
  }

  client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  db = client.db(mongoDbName);

  async function ensureIndexes(db) {
    const c = db.collection("assessments");
    await c.createIndex({ createdAt: -1 });
    await c.createIndex({ "analytics.createdAt": -1 });
    await c.createIndex({ "analytics.location": 1, "analytics.createdAt": -1 });
    await c.createIndex({
      "analytics.isFpoMember": 1,
      "analytics.createdAt": -1,
    });
    await c.createIndex({
      "analytics.riskCategory": 1,
      "analytics.createdAt": -1,
    });
    await c.createIndex({
      "analytics.aiAdjustment": 1,
      "analytics.createdAt": -1,
    });
  }

  // ping để chắc chắn connect ok
  await db.command({ ping: 1 });
  console.log(`[MongoDB] Connected to DB: ${mongoDbName}`);

  await ensureIndexes(db);

  return db;
}

function getDb() {
  if (!db) {
    const err = new Error("MongoDB not connected yet");
    err.statusCode = 500;
    throw err;
  }
  return db;
}

module.exports = { connectMongo, getDb };
