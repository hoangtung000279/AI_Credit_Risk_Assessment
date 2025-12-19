const { port } = require("./config/env");
const { createApp } = require("./app");
const { connectMongo } = require("./config/mongo_client");

async function main() {
  await connectMongo();

  const app = createApp();

  app.listen(port, "0.0.0.0", () => {
    console.log(`API running on port ${port}`);
  });
}

main().catch((err) => {
  console.error("[BOOT] failed to start:", err);
  process.exit(1);
});
