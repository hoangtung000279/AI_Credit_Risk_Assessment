module.exports = (err, _req, res, _next) => {
  const statusCandidate = err?.statusCode ?? err?.status;
  const status = Number.isInteger(statusCandidate) ? statusCandidate : 500;

  console.error("[ERROR]", status, err.message);
  if (err.stack) console.error(err.stack);

  res.status(status).json({
    ok: false,
    message: err.message || "Internal server error",
  });
};
