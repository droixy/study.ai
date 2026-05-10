// middleware/tokens.js — Token limit enforcement
const db = require("../config/db");

const MAX_TOKENS_PER_PROMPT = 500;

function tokenMiddleware(req, res, next) {
  const user = req.user;

  // Check if user has exceeded their quota
  if (user.tokens_used >= user.token_quota) {
    return res.status(403).json({
      error: "TOKEN_LIMIT_EXCEEDED",
      message: "You have used all your tokens for this billing period.",
      tokens_used: user.tokens_used,
      token_quota: user.token_quota,
    });
  }

  // Calculate remaining tokens, cap at MAX_TOKENS_PER_PROMPT
  const remaining = user.token_quota - user.tokens_used;
  req.maxTokens = Math.min(remaining, MAX_TOKENS_PER_PROMPT);

  next();
}

/**
 * Record token usage after a successful AI call.
 * Returns updated tokens_used count.
 */
function recordUsage(userId, aiTool, tokensUsed, prompt = "") {
  const truncatedPrompt = prompt.substring(0, 500);

  db.prepare(`
    INSERT INTO usage_logs (user_id, ai_tool, tokens_used, prompt)
    VALUES (?, ?, ?, ?)
  `).run(userId, aiTool, tokensUsed, truncatedPrompt);

  db.prepare(`
    UPDATE users SET tokens_used = tokens_used + ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(tokensUsed, userId);

  const user = db.prepare("SELECT tokens_used FROM users WHERE id = ?").get(userId);
  return user.tokens_used;
}

module.exports = { tokenMiddleware, recordUsage, MAX_TOKENS_PER_PROMPT };
