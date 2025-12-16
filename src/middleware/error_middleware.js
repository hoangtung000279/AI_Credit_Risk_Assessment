module.exports = function errorMiddleware(err, _req, res, _next) {
  const status =
    err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  console.error("[ERROR]", err);

  res.status(status).json({
    ok: false,
    message: status === 500 ? "Internal server error" : err.message,
  });
};
