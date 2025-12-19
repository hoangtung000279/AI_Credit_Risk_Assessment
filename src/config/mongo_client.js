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

  // ping để chắc chắn connect ok
  await db.command({ ping: 1 });
  console.log(`[MongoDB] Connected to DB: ${mongoDbName}`);

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
