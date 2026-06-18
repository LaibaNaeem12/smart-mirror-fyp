const express = require("express");
const { generateStylistAdvice } = require("../services/ollamaService");

const router = express.Router();

const STYLIST_FALLBACK_RESULT =
  "The stylist assistant is offline right now. Try a tailored layer with one statement piece, keep shoes in the same tone family as your belt, and use the rail filters to explore categories.";

/**
 * POST /api/ai/stylist
 * Body: { prompt: string, gender?: string, category?: string }
 * Response: { result: string }
 */
router.post("/stylist", async (req, res) => {
  const { prompt, gender, category } = req.body || {};

  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ message: "prompt is required (non-empty string)" });
  }

  try {
    const result = await generateStylistAdvice({ prompt, gender, category });
    return res.json({ result });
  } catch (err) {
    const code = err?.cause?.code || err?.code;
    console.error("[ai/stylist] Ollama path failed:", err?.message || err, code ? { code } : "");
    if (res.headersSent) return;
    return res.status(200).json({ result: STYLIST_FALLBACK_RESULT });
  }
});

module.exports = router;
