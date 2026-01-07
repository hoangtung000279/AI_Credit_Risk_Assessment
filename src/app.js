const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");

// const healthRoutes = require("./routes/health_routes");
const aiRoutes = require("./routes/ai_routes");
const assessmentRoutes = require("./routes/assessment_routes");
// const docsRoutes = require("./routes/docs_routes");
const adminRoutes = require("./routes/admin_routes");

const errorMiddleware = require("./middleware/error_middleware");
const requestLogger = require("./middleware/request_logger");

function createApp() {
  const app = express();

  // Nếu deploy sau proxy (Nginx/Cloudflare/Render/Heroku) => lấy đúng IP/proto
  app.set("trust proxy", 1);

  // RequestId + latency baseline
  app.use((req, res, next) => {
    req._startedAt = Date.now();

    const incomingId = req.header("x-request-id");
    req.id = incomingId || crypto.randomUUID();

    res.setHeader("x-request-id", req.id);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: true,
      credentials: false,
      exposedHeaders: ["x-request-id"],
    })
  );

  app.use(express.json({ limit: "1mb", strict: true }));

  // ✅ Logger phải đặt TRƯỚC routes để log được tất cả request
  app.use(requestLogger);

  // Routes
  // app.use("/", healthRoutes);
  app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  // app.use("/", docsRoutes);
  app.use("/api/v1", aiRoutes);
  app.use("/api/v1", assessmentRoutes);
  app.use("/api/v1", adminRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      message: "Not Found",
      meta: {
        requestId: req.id || null,
        path: req.originalUrl,
        method: req.method,
      },
    });
  });

  // Error middleware MUST be last
  app.use(errorMiddleware);
  return app;
}

module.exports = { createApp };
