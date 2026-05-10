// server.js — StudyStack AI Backend Entry Point
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 4000;

// ──────────────────────────────────────────────
// SECURITY
// ──────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/ai", limiter);

// ──────────────────────────────────────────────
// BODY PARSING
// The Stripe webhook needs the RAW body for signature verification.
// All other routes use JSON parsing.
// ──────────────────────────────────────────────
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" })
);
app.use(express.json({ limit: "1mb" }));

// ──────────────────────────────────────────────
// ROUTES
// ──────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/stripe", require("./routes/stripe"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────
// ERROR HANDLING
// ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// ──────────────────────────────────────────────
// START SERVER
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║       StudyStack AI Backend Running        ║
  ║      http://localhost:${PORT}           ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
