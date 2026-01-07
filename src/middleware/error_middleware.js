// src/middlewares/error_middleware.js
function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function clampHttpStatus(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 500;
  const s = Math.trunc(n);
  if (s < 400 || s > 599) return 500;
  return s;
}

function detectStatus(err) {
  // Express invalid JSON body
  if (err instanceof SyntaxError && err?.type === "entity.parse.failed") {
    return 400;
  }

  // Mongo duplicate key
  if (err?.code === 11000) return 409;

  return clampHttpStatus(err?.statusCode ?? err?.status);
}

function detectCode(err, status) {
  // Nếu bạn có hệ thống code riêng thì map tại đây
  if (err?.code && typeof err.code === "string") return err.code;

  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "ERROR";
}

function detectMessage(err, status) {
  if (status === 400 && err instanceof SyntaxError) return "Invalid JSON body";
  if (status === 409 && err?.code === 11000) return "Duplicate resource";
  return err?.message || "Internal server error";
}

function maskQuery(q) {
  const safe = { ...(q || {}) };
  if (safe.key) safe.key = "***";
  // NOTE: x-admin-key là header, không phải query.
  return safe;
}

function getRequestId(req, res) {
  return (
    req?.id ||
    req?.headers?.["x-request-id"] ||
    (typeof res?.getHeader === "function"
      ? res.getHeader("x-request-id")
      : null) ||
    null
  );
}

module.exports = (err, req, res, _next) => {
  const status = detectStatus(err);
  const code = detectCode(err, status);
  const message = detectMessage(err, status);

  // Nếu headers đã gửi (vd PDF streaming), không được set header/json nữa.
  // Chỉ log và thoát để tránh "Cannot set headers after they are sent".
  if (res.headersSent) {
    const rid = getRequestId(req, res);
    console.error(
      "[ERROR_HEADERS_SENT]",
      JSON.stringify({
        status,
        code,
        message,
        requestId: rid,
        method: req?.method,
        path: req?.originalUrl,
      })
    );

    if (!isProd() && err?.stack) console.error(err.stack);
    return;
  }

  const requestId = getRequestId(req, res);
  const latencyMs =
    typeof req?._startedAt === "number" ? Date.now() - req._startedAt : null;

  // Logging: mask query, không log admin key header
  console.error(
    "[ERROR]",
    JSON.stringify({
      status,
      code,
      message,
      requestId,
      method: req?.method,
      path: req?.originalUrl,
      query: maskQuery(req?.query),
    })
  );

  if (!isProd() && err?.stack) console.error(err.stack);

  // Response: giữ ok/message để không phá BE cũ, thêm code/meta/details (optional)
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: err?.details ?? null,
    meta: {
      requestId,
      latencyMs,
      path: req?.originalUrl ?? null,
      method: req?.method ?? null,
    },
  });
};
