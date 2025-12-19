const { getDb } = require("../config/mongo_client");

function collection() {
  return getDb().collection("assessments");
}

async function insertAssessment(doc) {
  const res = await collection().insertOne(doc);
  return res.insertedId;
}

module.exports = { insertAssessment };
