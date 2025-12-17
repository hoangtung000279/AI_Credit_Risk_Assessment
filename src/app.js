const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const healthRoutes = require("./routes/health_routes");
const aiRoutes = require("./routes/ai_routes");
const errorMiddleware = require("./middleware/error_middleware");
const assessmentRoutes = require("./routes/assessment_routes");
const docsRoutes = require("./routes/docs_routes");

function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use("/", healthRoutes);
  app.use("/", docsRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api", assessmentRoutes);

  app.use(errorMiddleware);
  return app;
}

module.exports = { createApp };
