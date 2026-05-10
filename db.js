// config/db.js — SQLite database setup with better-sqlite3
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "studyai.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");

// ──────────────────────────────────────────────
// SCHEMA
// ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    UNIQUE NOT NULL,
    password_hash   TEXT    NOT NULL,
    name            TEXT    DEFAULT '',
    email_verified  INTEGER DEFAULT 0,
    stripe_customer_id TEXT DEFAULT NULL,
    subscription_status TEXT DEFAULT 'free',   -- free | student | pro
    token_quota     INTEGER DEFAULT 500,
    tokens_used     INTEGER DEFAULT 0,
    current_period_end TEXT DEFAULT NULL,
    created_at      TEXT    DEFAULT (datetime('now')),
    updated_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pending_verifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT    NOT NULL,
    password_hash   TEXT    NOT NULL,
    name            TEXT    DEFAULT '',
    code            TEXT    NOT NULL,
    expires_at      TEXT    NOT NULL,
    created_at      TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    ai_tool     TEXT    NOT NULL,
    tokens_used INTEGER NOT NULL,
    prompt      TEXT,
    created_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_pending_email ON pending_verifications(email);
`);

module.exports = db;
