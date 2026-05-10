// routes/ai.js — AI proxy routes (all API keys stay server-side)
const express = require("express");
const OpenAI = require("openai");
const Anthropic = require("anthropic").default;
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const { tokenMiddleware, recordUsage } = require("../middleware/tokens");

const router = express.Router();

// Apply auth + token check to all AI routes
router.use(authMiddleware);
router.use(tokenMiddleware);

// ──────────────────────────────────────────────
// 1. CHATGPT (GPT-5.4) — General Study
// ──────────────────────────────────────────────
router.post("/chatgpt", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_tokens: req.maxTokens,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI study assistant. Provide clear, accurate, and educational responses. " +
            "Break down complex concepts, give examples, and help students understand topics deeply.",
        },
        { role: "user", content: message },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const tokensUsed = completion.usage?.total_tokens || Math.ceil(responseText.length / 4);

    const totalUsed = recordUsage(req.user.id, "chatgpt", tokensUsed, message);

    res.json({
      response: responseText,
      tokens_used: totalUsed,
      tokens_used_this_request: tokensUsed,
    });
  } catch (err) {
    console.error("ChatGPT error:", err.message);
    res.status(500).json({ error: "Failed to get response from ChatGPT." });
  }
});

// ──────────────────────────────────────────────
// 2. PERPLEXITY — Research & Verified Sources
// ──────────────────────────────────────────────
router.post("/perplexity", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    const response = await axios.post(
      "https://api.perplexity.ai/chat/completions",
      {
        model: "sonar",
        max_tokens: req.maxTokens,
        messages: [
          {
            role: "system",
            content:
              "You are an academic research assistant. Provide well-sourced, verified information. " +
              "Cite your sources. Focus on peer-reviewed papers, official documentation, and reliable academic resources. " +
              "Help students find course materials, understand lecture notes, and verify information.",
          },
          { role: "user", content: message },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const responseText = response.data.choices[0]?.message?.content || "";
    const tokensUsed = response.data.usage?.total_tokens || Math.ceil(responseText.length / 4);

    const totalUsed = recordUsage(req.user.id, "perplexity", tokensUsed, message);

    res.json({
      response: responseText,
      tokens_used: totalUsed,
      tokens_used_this_request: tokensUsed,
    });
  } catch (err) {
    console.error("Perplexity error:", err.message);
    res.status(500).json({ error: "Failed to get response from Perplexity." });
  }
});

// ──────────────────────────────────────────────
// 3. CLAUDE — Writing Assistance
// ──────────────────────────────────────────────
router.post("/claude", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: req.maxTokens,
      system:
        "You are an expert academic writing assistant. Help students with essay writing, thesis drafting, " +
        "summarization, paraphrasing, grammar correction, citation formatting, and academic writing style. " +
        "Provide constructive feedback and help improve their writing skills.",
      messages: [{ role: "user", content: message }],
    });

    const responseText =
      response.content?.map((c) => c.text).join("") || "";
    const tokensUsed =
      (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0) ||
      Math.ceil(responseText.length / 4);

    const totalUsed = recordUsage(req.user.id, "claude", tokensUsed, message);

    res.json({
      response: responseText,
      tokens_used: totalUsed,
      tokens_used_this_request: tokensUsed,
    });
  } catch (err) {
    console.error("Claude error:", err.message);
    res.status(500).json({ error: "Failed to get response from Claude." });
  }
});

// ──────────────────────────────────────────────
// 4. TURBO AI — Flashcards & Quizzes
// ──────────────────────────────────────────────
router.post("/turbo", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    // Turbo AI uses OpenAI's GPT-4-turbo for structured flashcard generation
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: req.maxTokens,
      messages: [
        {
          role: "system",
          content:
            "You are a flashcard and quiz generation AI. When given a topic or content:\n" +
            "1. Create well-structured flashcards with QUESTION on one side and ANSWER on the other.\n" +
            "2. Format each flashcard clearly with '**Q:**' and '**A:**' prefixes.\n" +
            "3. If asked for a quiz, create multiple-choice questions with correct answers marked.\n" +
            "4. Use spaced-repetition principles — order from fundamental to advanced.\n" +
            "5. Keep answers concise but complete.\n" +
            "Generate 5-10 flashcards per request unless specified otherwise.",
        },
        { role: "user", content: message },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || "";
    const tokensUsed = completion.usage?.total_tokens || Math.ceil(responseText.length / 4);

    const totalUsed = recordUsage(req.user.id, "turbo", tokensUsed, message);

    res.json({
      response: responseText,
      tokens_used: totalUsed,
      tokens_used_this_request: tokensUsed,
    });
  } catch (err) {
    console.error("Turbo error:", err.message);
    res.status(500).json({ error: "Failed to get response from Turbo AI." });
  }
});

// ──────────────────────────────────────────────
// 5. WOLFRAM — Math & Problem Solving
// ──────────────────────────────────────────────
router.post("/wolfram", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    // First, try Wolfram Alpha Short Answers API for direct math
    let wolframResult = "";
    try {
      const waResponse = await axios.get("https://api.wolframalpha.com/v2/query", {
        params: {
          input: message,
          format: "plaintext",
          output: "JSON",
          appid: process.env.WOLFRAM_APP_ID,
        },
      });

      const pods = waResponse.data?.queryresult?.pods || [];
      wolframResult = pods
        .map((pod) => {
          const subpodTexts = pod.subpods
            ?.map((sp) => sp.plaintext)
            .filter(Boolean)
            .join("\n");
          return subpodTexts ? `**${pod.title}:**\n${subpodTexts}` : null;
        })
        .filter(Boolean)
        .join("\n\n");
    } catch {
      // Wolfram Alpha may not understand all queries; fallback below
    }

    // If Wolfram didn't produce results, use GPT for step-by-step math
    if (!wolframResult) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await openai.chat.completions.create({
        model: "gpt-5.4",
        max_tokens: req.maxTokens,
        messages: [
          {
            role: "system",
            content:
              "You are a math and science tutor. Solve problems step-by-step with clear explanations. " +
              "Show all work, explain each step, and verify your answer. Use proper mathematical notation.",
          },
          { role: "user", content: message },
        ],
      });

      wolframResult = completion.choices[0]?.message?.content || "";
    }

    // Estimate token usage (Wolfram API doesn't have token counting)
    const tokensUsed = Math.min(Math.ceil(wolframResult.length / 4) + Math.ceil(message.length / 4), req.maxTokens);

    const totalUsed = recordUsage(req.user.id, "wolfram", tokensUsed, message);

    res.json({
      response: wolframResult || "Could not solve this problem. Please try rephrasing.",
      tokens_used: totalUsed,
      tokens_used_this_request: tokensUsed,
    });
  } catch (err) {
    console.error("Wolfram error:", err.message);
    res.status(500).json({ error: "Failed to get response from Wolfram." });
  }
});

module.exports = router;
