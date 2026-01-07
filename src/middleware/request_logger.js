module.exports = function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const latencyMs = Date.now() - startedAt;
    const requestId = req.id || req.header("x-request-id") || null;

    // Log gọn: đủ để debug production
    console.log(
      "[REQ]",
      JSON.stringify({
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        latencyMs,
        requestId,
      })
    );
  });

  next();
};
