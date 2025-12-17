module.exports = (err, _req, res, _next) => {
  const status =
    err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;

  console.error("[ERROR]", status, err.message);
  if (err.stack) console.error(err.stack);

  // ✅ tạm thời trả message thật để debug
  res.status(status).json({
    ok: false,
    message: err.message || "Internal server error",
  });
};
