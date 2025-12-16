const express = require("express");

const router = express.Router();

router.get("/", (_req, res) => {
  res.status(200).send("API is running... Try GET /health");
});

router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
