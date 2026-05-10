// routes/auth.js — Signup with email verification + Login
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../config/db");

const router = express.Router();

// ── Email transporter ──
function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Generate 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Step 1: Sign Up — sends verification code ──
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare("DELETE FROM pending_verifications WHERE email = ?").run(email.toLowerCase());

    db.prepare(`
      INSERT INTO pending_verifications (email, password_hash, name, code, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(email.toLowerCase(), passwordHash, name || "", code, expiresAt);

    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `"StudyStack AI" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your StudyStack AI Verification Code",
        html: `
          <div style="font-family: 'Helvetica', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 24px; font-weight: 800;">studystack<span style="color: #4F8CFF;">ai</span></span>
              <h1 style="color: #0B0F14; font-size: 24px; margin: 12px 0 4px;">StudyStack AI</h1>
            </div>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">Hi ${name || "there"},</p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">Your verification code is:</p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="background: linear-gradient(135deg, #4F8CFF, #7A5CFF); color: #fff; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 16px 32px; border-radius: 12px; display: inline-block;">${code}</span>
            </div>
            <p style="color: #666; font-size: 13px; text-align: center;">This code expires in 10 minutes.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 11px; text-align: center;">If you didn't sign up for StudyStack AI, ignore this email.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("Failed to send verification email:", mailErr.message);
      return res.status(500).json({ error: "Failed to send verification email. Check your email settings." });
    }

    res.status(200).json({
      message: "Verification code sent",
      requires_verification: true,
      email: email.toLowerCase(),
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── Step 2: Verify Code — creates the account ──
router.post("/verify", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required." });
    }

    const pending = db.prepare(
      "SELECT * FROM pending_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1"
    ).get(email.toLowerCase());

    if (!pending) {
      return res.status(404).json({ error: "No pending verification found. Please sign up again." });
    }

    if (new Date(pending.expires_at) < new Date()) {
      db.prepare("DELETE FROM pending_verifications WHERE email = ?").run(email.toLowerCase());
      return res.status(410).json({ error: "Code expired. Please sign up again." });
    }

    if (pending.code !== code.trim()) {
      return res.status(401).json({ error: "Incorrect code. Please try again." });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
      db.prepare("DELETE FROM pending_verifications WHERE email = ?").run(email.toLowerCase());
      return res.status(409).json({ error: "Account already exists. Please log in." });
    }

    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, email_verified, subscription_status, token_quota, tokens_used)
      VALUES (?, ?, ?, 1, 'free', 500, 0)
    `).run(email.toLowerCase(), pending.password_hash, pending.name);

    const userId = result.lastInsertRowid;
    db.prepare("DELETE FROM pending_verifications WHERE email = ?").run(email.toLowerCase());

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

    // Notify admin
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        const mailer = getMailer();
        await mailer.sendMail({
          from: `"StudyStack AI" <${process.env.SMTP_USER}>`,
          to: adminEmail,
          subject: `New StudyStack AI Signup: ${user.name || user.email}`,
          html: `
            <div style="font-family: 'Helvetica', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
              <h2 style="color: #0B0F14;">🎉 New User Signed Up</h2>
              <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                <tr><td style="padding: 8px 0; color: #666; width: 100px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${user.name || "—"}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0; font-weight: 600;">${user.email}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Plan</td><td style="padding: 8px 0; font-weight: 600;">Free</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 600;">${new Date().toLocaleString()}</td></tr>
              </table>
            </div>
          `,
        });
      }
    } catch (adminMailErr) {
      console.error("Failed to send admin notification:", adminMailErr.message);
    }

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_status: user.subscription_status,
        token_quota: user.token_quota,
        tokens_used: user.tokens_used,
      },
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── Resend code ──
router.post("/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    const pending = db.prepare(
      "SELECT * FROM pending_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1"
    ).get(email.toLowerCase());

    if (!pending) {
      return res.status(404).json({ error: "No pending signup found. Please sign up again." });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.prepare("UPDATE pending_verifications SET code = ?, expires_at = ? WHERE email = ?").run(code, expiresAt, email.toLowerCase());

    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `"StudyStack AI" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your New StudyStack AI Verification Code",
        html: `
          <div style="font-family: 'Helvetica', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="font-size: 24px; font-weight: 800;">studystack<span style="color: #4F8CFF;">ai</span></span>
              <h1 style="color: #0B0F14; font-size: 24px; margin: 12px 0 4px;">StudyStack AI</h1>
            </div>
            <p style="color: #333; font-size: 15px;">Here's your new code:</p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="background: linear-gradient(135deg, #4F8CFF, #7A5CFF); color: #fff; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 16px 32px; border-radius: 12px; display: inline-block;">${code}</span>
            </div>
            <p style="color: #666; font-size: 13px; text-align: center;">This code expires in 10 minutes.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      return res.status(500).json({ error: "Failed to send email." });
    }

    res.json({ message: "New code sent." });
  } catch (err) {
    console.error("Resend error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── Login ──
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_status: user.subscription_status,
        token_quota: user.token_quota,
        tokens_used: user.tokens_used,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// ── Get current user info ──
router.get("/me", require("../middleware/auth"), (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, email: u.email, name: u.name,
    subscription_status: u.subscription_status,
    token_quota: u.token_quota, tokens_used: u.tokens_used,
    current_period_end: u.current_period_end,
  });
});

module.exports = router;
