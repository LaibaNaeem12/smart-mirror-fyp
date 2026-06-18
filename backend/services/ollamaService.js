/**
 * Local LLM via Ollama HTTP API.
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion
 *
 * Environment:
 *   OLLAMA_BASE_URL — default http://localhost:11434
 *   OLLAMA_MODEL — default llama3.2 (override with phi3, mistral, etc.)
 *   OLLAMA_TIMEOUT_MS — default 120000
 *   OLLAMA_DEBUG — if not "false", logs model, request lifecycle, and errors
 *   OLLAMA_NUM_CTX — context size (default 2048). Lower = less RAM; raise if replies truncate.
 *   OLLAMA_NUM_THREAD — optional CPU thread cap for the runner (e.g. 4 on low-RAM hosts).
 *   OLLAMA_NUM_BATCH — prompt batch size (default 128). Lower = less RAM during inference.
 *   OLLAMA_NUM_GPU — set to 0 to force CPU-only (can help on machines with broken GPU drivers).
 */

const DEFAULT_BASE = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";
const DEFAULT_TIMEOUT_MS = 120000;

function debugEnabled() {
  return process.env.OLLAMA_DEBUG !== "false";
}

function logDebug(...args) {
  if (debugEnabled()) console.log("[ollama-debug]", ...args);
}

function readTimeoutMs() {
  const raw = process.env.OLLAMA_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.floor(n), 600_000);
}

/** Ollama `/api/generate` options — smaller num_ctx / num_batch reduce RAM (many "allocate CPU buffer" failures). */
function readOllamaGenerateOptions() {
  const DEFAULT_NUM_CTX = 2048;
  const DEFAULT_NUM_BATCH = 128;
  const rawCtx = process.env.OLLAMA_NUM_CTX;
  let num_ctx = DEFAULT_NUM_CTX;
  if (rawCtx != null && String(rawCtx).trim() !== "") {
    const n = Number(rawCtx);
    if (Number.isFinite(n) && n >= 256) {
      num_ctx = Math.min(Math.floor(n), 32768);
    }
  }
  const opts = { num_ctx };

  const rawBatch = process.env.OLLAMA_NUM_BATCH;
  let num_batch = DEFAULT_NUM_BATCH;
  if (rawBatch != null && String(rawBatch).trim() !== "") {
    const b = Number(rawBatch);
    if (Number.isFinite(b) && b >= 1) {
      num_batch = Math.min(Math.floor(b), 4096);
    }
  }
  opts.num_batch = num_batch;

  const rawTh = process.env.OLLAMA_NUM_THREAD;
  if (rawTh != null && String(rawTh).trim() !== "") {
    const t = Number(rawTh);
    if (Number.isFinite(t) && t >= 1) {
      opts.num_thread = Math.min(Math.floor(t), 32);
    }
  }

  const rawGpu = process.env.OLLAMA_NUM_GPU;
  if (rawGpu != null && String(rawGpu).trim() !== "") {
    const g = Number(rawGpu);
    if (Number.isFinite(g) && g >= 0 && g <= 999) {
      opts.num_gpu = Math.floor(g);
    }
  }

  return opts;
}

function logAllocationHintFromBody(text) {
  const s = String(text || "");
  if (/allocate CPU buffer|unable to allocate|panic:/i.test(s)) {
    console.error(
      "[ollama] Hint: model failed to load (usually RAM). In backend/.env try: OLLAMA_NUM_CTX=1024 (or 512), " +
        "OLLAMA_NUM_BATCH=64, OLLAMA_NUM_THREAD=4, OLLAMA_NUM_GPU=0 (CPU-only), and/or a smaller model " +
        "(e.g. phi3:mini, qwen2:0.5b). Then `ollama pull <name>` and set OLLAMA_MODEL. Close other apps or increase Windows page file if needed."
    );
  }
}

/** Global instructions for POST /api/ai/stylist (Ollama /api/generate `prompt`). */
const SMART_MIRROR_STYLIST_SYSTEM = `SYSTEM PROMPT — SMART MIRROR STYLIST v5 (HARD LOCK MODE)

You are a Smart Mirror Fashion Stylist AI.

YOUR ONLY JOB:
Return structured outfit data ONLY.

---

🚫 ABSOLUTE FORBIDDEN:

* No explanations
* No assistant messages
* No "I can help you"
* No sentences
* No paragraphs
* No conversational text
* No markdown
* No filler text

---

📌 OUTPUT FORMAT (STRICT JSON-LIKE TEXT ONLY):

Style Name: <short style>

Outfit Idea: <1 line>
Colors: <comma separated>
Clothing Items: <list>
Accessories: <optional>
Style Tip: <1 line>

---

⚠️ HARD RULE:

* You MUST NOT write anything outside this format
* If user input is unclear → still generate outfit in this format
* Never refuse
* Never explain
* Never talk about yourself

---

👕 FASHION RULES:

* Always suggest wearable outfits
* No brands allowed
* No luxury references
* No marketing language
* No shoes unless explicitly asked

---

EXAMPLES:

Input: Casual university look
Output:
Style Name: Campus Casual
Outfit Idea: Hoodie with straight jeans
Colors: white, black, grey
Clothing Items: hoodie, jeans, sneakers
Accessories: backpack
Style Tip: Keep it clean and minimal

---

This is FINAL HARD MODE FOR SMART MIRROR AI.`;

function buildPrompt(userPrompt, gender, category) {
  const g =
    gender != null && String(gender).trim() ? String(gender).trim() : "not specified";
  const c =
    category != null && String(category).trim()
      ? String(category).trim()
      : "not specified";
  const q = String(userPrompt).trim();

  return `${SMART_MIRROR_STYLIST_SYSTEM}

---

CONTEXT:
- Shopper gender: ${g}
- Selected garment category: ${c}

USER QUESTION:
${q}

Reply with ONLY these lines and labels, in this exact order—nothing before or after:
Style Name:
Outfit Idea:
Colors:
Clothing Items:
Accessories:
Style Tip:`;
}

function describeFetchError(e) {
  if (!e) return "unknown error";
  if (e.name === "AbortError") return "aborted (timeout)";
  const code = e.cause?.code || e.code;
  if (code === "ECONNREFUSED") {
    return "ECONNREFUSED — Ollama is not running or wrong port (expected http://localhost:11434)";
  }
  if (code === "ENOTFOUND") return "ENOTFOUND — check OLLAMA_BASE_URL host";
  if (typeof e.message === "string" && e.message) return e.message;
  return String(e);
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.gender]
 * @param {string} [opts.category]
 * @returns {Promise<string>} Model text (throws on failure — route applies fallback).
 */
async function generateStylistAdvice({ prompt, gender, category }) {
  const p = String(prompt ?? "").trim();
  if (!p) {
    throw new Error("prompt is required");
  }

  const baseRaw = process.env.OLLAMA_BASE_URL || DEFAULT_BASE;
  const base = String(baseRaw).replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) {
    throw new Error("OLLAMA_BASE_URL must be an http(s) URL");
  }

  const modelRaw = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const model = String(modelRaw).trim() || DEFAULT_MODEL;
  const timeoutMs = readTimeoutMs();

  const ollamaOptions = readOllamaGenerateOptions();
  logDebug("request", {
    OLLAMA_BASE_URL: base,
    OLLAMA_MODEL: model,
    OLLAMA_TIMEOUT_MS: timeoutMs,
    options: ollamaOptions,
  });

  const fullPrompt = buildPrompt(p, gender, category);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false,
        options: ollamaOptions,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[ollama] HTTP failure", { status: res.status, body: text.slice(0, 500) });
      logAllocationHintFromBody(text);
      throw new Error(`Ollama HTTP ${res.status}`);
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      console.error("[ollama] JSON parse error", { message: e.message, name: e.name });
      throw new Error("Invalid JSON from Ollama");
    }

    if (data && typeof data.error === "string" && data.error.trim()) {
      console.error("[ollama] API error field", { error: data.error, model });
      logDebug("response failure", "ollama error field present");
      throw new Error(data.error.trim());
    }

    const out = data?.response != null ? String(data.response).trim() : "";
    if (!out) {
      console.error("[ollama] Empty model response", { model });
      throw new Error("Empty response from Ollama");
    }

    return out;
  } catch (e) {
    if (e && e.name === "AbortError") {
      console.error("[ollama] Request timed out", { timeoutMs });
      throw new Error("Ollama request timed out");
    }
    const msg = describeFetchError(e);
    console.error("[ollama] Request failed:", msg);
    throw e instanceof Error ? e : new Error(msg);
  } finally {
    clearTimeout(t);
  }
}

module.exports = { generateStylistAdvice, readOllamaGenerateOptions };
