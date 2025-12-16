const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const healthRoutes = require("./routes/health_routes");
const aiRoutes = require("./routes/ai_routes");
const errorMiddleware = require("./middleware/error_middleware");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use("/", healthRoutes);
  app.use("/api/ai", aiRoutes);

  app.use(errorMiddleware);
  return app;
}

module.exports = { createApp };
