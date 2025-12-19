require("dotenv").config();

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || "";
const mongoDbName = process.env.MONGODB_DB || "credit_risk";

module.exports = { port, mongoUri, mongoDbName };
