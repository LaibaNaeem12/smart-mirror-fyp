/**
 * Replicate API integration for virtual try-on (server-side only).
 *
 * Env (loaded via config/loadEnv.js → backend/.env):
 *   REPLICATE_API_TOKEN     — required for live runs (https://replicate.com/account/api-tokens)
 *   REPLICATE_TRYON_MODEL         — owner/model or owner/model:64hex. Examples:
 *                             mmezhov/catvton-flux (CATVTON-Flux, needs HF token) or cuuupid/idm-vton (IDM-VTON).
 *   REPLICATE_TRYON_PRIMARY       — when MODEL is unset: "catvton" (default) or "idm-vton" selects default base + digest.
 *   REPLICATE_TRYON_VERSION       — optional digest when MODEL has no ":version" (family-specific default if unset).
 *   REPLICATE_CATVTON_HF_TOKEN    — Hugging Face token (FLUX.1-dev terms); also reads HF_TOKEN / HUGGING_FACE_HUB_TOKEN.
 *                             If CATVTON is selected but this is unset, requests automatically use pinned IDM-VTON instead.
 *   REPLICATE_CATVTON_WIDTH       — default 576
 *   REPLICATE_CATVTON_HEIGHT      — default 768
 *   REPLICATE_CATVTON_NUM_STEPS   — default 32
 *   REPLICATE_CATVTON_GUIDANCE_SCALE — default 30
 *   REPLICATE_CATVTON_SEED        — default 0
 *   (Removed) REPLICATE_TRYON_STARTING_ABORT_MS — cold-start cancel is disabled; Replicate runs to completion for async polls.
 *   REPLICATE_TRYON_HUMAN_FIELD   — default: human_img (Replicate cuuupid/idm-vton API; not "human")
 *   REPLICATE_TRYON_GARMENT_FIELD — default: garm_img
 *   REPLICATE_TRYON_CATEGORY      — optional default garment region: upper_body | lower_body | dresses
 *   REPLICATE_TRYON_TIMEOUT_MS       — default: 420000 (7m). Hard stop for the whole try-on poll loop.
 *   REPLICATE_TRYON_POLL_INTERVAL_MS — legacy; sync generateTryOn poll uses exponential backoff (1s→10s).
 *   TRY_ON_FLOW_DEBUG             — optional "true": log raw Replicate output shape + normalized URL (server only)
 *   REPLICATE_MODEL_VERSION       — optional; logged under [MODEL CHECK] when set (alias note for operators)
 *   TRY_ON_EXHIBITION_COMPOSITE_FALLBACK — default "true": if model URL is missing or fails heuristic vs inputs,
 *                             return a local Sharp demo composite (person + garment overlay) so demos never break.
 *   TRY_ON_SMART_POSE_OVERLAY — default "true": in fallback chain, run MoveNet pose (CPU) for garment alignment
 *                             before the simple L3 composite. Set "false" for L3-only (faster cold start).
 *   TRY_ON_POSE_MAX_SIDE / TRY_ON_POSE_MIN_SCORE / MOVE_NET_MODEL_URL — tune or pin MoveNet weights offline.
 *
 * Never expose REPLICATE_API_TOKEN to the frontend.
 */

const Replicate = require("replicate");
const ModelVersionIdentifier = require("replicate/lib/identifier");
const {
  registerPredictionOpen,
  ensurePredictionContext,
  getRegisteredTryOnModelRef,
  recordPollAndMaybeLog,
  markPredictionLifecycleEnd,
} = require("../utils/tryOnPredictionMetrics");
const {
  isExhibitionFallbackEnabled,
  inlineNonPublicHttpUrlForExternalApi,
} = require("../utils/tryOnDemoComposite");
const { buildCatvtonImages } = require("../utils/catvtonPrepare");
const { resolveExhibitionFinalImage } = require("../utils/tryOnExhibitionFallbackChain");

/** Verbose try-on output tracing (raw Replicate value, normalized URL). Set TRY_ON_FLOW_DEBUG=true in backend/.env. */
function isTryOnFlowDebug() {
  return String(process.env.TRY_ON_FLOW_DEBUG || "").trim() === "true";
}

/**
 * Safe summary of replicate.run() return value for logs (no full payloads / streams).
 * @param {unknown} out
 */
function describeReplicateRawOutput(out) {
  if (out === null || out === undefined) return { kind: "nullish" };
  const t = typeof out;
  if (t === "string") {
    return { kind: "string", length: out.length, prefix: out.slice(0, 96) };
  }
  if (Array.isArray(out)) {
    return {
      kind: "array",
      length: out.length,
      elementPreview: out.slice(0, 5).map((el) => describeReplicateRawOutput(el)),
    };
  }
  if (t === "object") {
    const ctor = /** @type {{ constructor?: { name?: string } }} */ (out).constructor?.name;
    const o = /** @type {Record<string, unknown>} */ (out);
    const keys = Object.keys(o).slice(0, 24);
    const hasUrlFn = typeof o.url === "function";
    const hasUrlStr = typeof o.url === "string";
    return { kind: "object", ctor: ctor || "Object", keys, hasUrlFn, hasUrlStr };
  }
  return { kind: t };
}

/**
 * @param {string} modelRef
 * @returns {"catvton" | "idm-vton" | "other"}
 */
function detectTryOnFamily(modelRef) {
  const s = String(modelRef || "").toLowerCase();
  if (s.includes("catvton")) return "catvton";
  if (s.includes("idm-vton") || s.includes("idm_vton")) return "idm-vton";
  return "other";
}

/**
 * @param {string} modelRef
 * @returns {boolean}
 */
function isCatvtonModelRef(modelRef) {
  return detectTryOnFamily(modelRef) === "catvton";
}

/**
 * JSON.stringify for terminal logs (Replicate `prediction.output` may be nested).
 * @param {unknown} output
 * @returns {string}
 */
function safeStringifyPredictionOutput(output) {
  try {
    return JSON.stringify(output, (_k, v) => (typeof v === "function" ? "[Function]" : v), 2);
  } catch (e) {
    return `["stringify_error", ${/** @type {Error} */ (e).message}]`;
  }
}

const TRYON_NON_RESULT_KEYS = new Set([
  "garment",
  "garm_img",
  "human_img",
  "human",
  "cloth",
  "mask",
  "person",
  "model_image",
  "clothing",
  "hf_token",
  "input",
]);

/**
 * Extract a single try-on result image URL from Replicate output (string | FileOutput | nested).
 * @param {unknown} output
 * @param {number} [depth]
 * @returns {string | null}
 */
function extractTryOnResultImageUrl(output, depth = 0) {
  if (depth > 14 || output == null) return null;

  const direct = coerceImageUrl(output);
  if (direct) return direct;

  if (Array.isArray(output)) {
    for (let i = output.length - 1; i >= 0; i -= 1) {
      const u = extractTryOnResultImageUrl(output[i], depth + 1);
      if (u) return u;
    }
    return null;
  }

  if (typeof output === "object") {
    const o = /** @type {Record<string, unknown>} */ (output);
    const preferred = [
      "output",
      "result",
      "image",
      "final_image",
      "try_on",
      "tryon_image",
      "generated_image",
      "prediction",
      "url",
    ];
    for (const k of preferred) {
      if (o[k] == null) continue;
      const u = extractTryOnResultImageUrl(o[k], depth + 1);
      if (u) return u;
    }
    for (const [k, v] of Object.entries(o)) {
      if (TRYON_NON_RESULT_KEYS.has(k.toLowerCase())) continue;
      const u = extractTryOnResultImageUrl(v, depth + 1);
      if (u) return u;
    }
  }

  return null;
}

/**
 * Strict check: try-on output must be a non-trivial image URL string.
 * @param {unknown} output
 * @returns {boolean}
 */
function isValidTryOn(output) {
  if (!output || typeof output !== "string") return false;
  const t = output.trim();
  if (t.length < 24) return false;
  const low = t.toLowerCase();
  return low.startsWith("http") || low.startsWith("data:image");
}

/**
 * @param {string} label
 * @param {string} ref
 */
function logTryOnInputRef(label, ref) {
  if (!isTryOnFlowDebug()) return;
  const s = String(ref || "").trim();
  if (!s) {
    console.log(label, "");
    return;
  }
  if (s.length > 1200) {
    console.log(label, `${s.slice(0, 500)}… (truncated for log, ${s.length} chars total)`);
    return;
  }
  console.log(label, s);
}

/**
 * @param {string} kind
 * @param {string} modelRef
 * @param {Record<string, unknown>} input
 */
function logTryOnPayloadFinal(kind, modelRef, input) {
  if (!isTryOnFlowDebug()) return;
  const safe = /** @type {Record<string, unknown>} */ ({ ...input });
  if (typeof safe.hf_token === "string") safe.hf_token = "[redacted]";
  for (const k of Object.keys(safe)) {
    const v = safe[k];
    if (typeof v === "string" && v.length > 400) {
      safe[k] = `${v.slice(0, 200)}… (+${v.length} chars)`;
    }
  }
  console.log("[TRYON MODEL USED]", modelRef);
  console.log("[TRYON PAYLOAD FINAL]", JSON.stringify({ kind, modelRef, input: safe }, null, 2));
}

/**
 * @param {string} human
 * @param {string} garment
 */
function assertNonEmptyTryOnInputs(human, garment) {
  const h = String(human || "").trim();
  const g = String(garment || "").trim();
  if (!h || !g) {
    throw new ReplicateTryOnError("Missing person or cloth image for try-on", { code: "INVALID_INPUT" });
  }
}

/**
 * Replicate models accept https URLs or data:image/* payloads.
 * @param {"person" | "garment"} role
 * @param {string} ref
 */
function assertReplicateReadableImageRef(role, ref) {
  const s = String(ref || "").trim();
  if (!/^https?:\/\//i.test(s) && !/^data:image\//i.test(s)) {
    throw new ReplicateTryOnError(
      `${role} image must be a valid https URL or data:image/* URL (got non-HTTP ref)`,
      { code: "INVALID_INPUT" }
    );
  }
}

/** Dedupe terminal completion logs when clients poll repeatedly after success. */
const terminalTryonLoggedIds = new Set();

/**
 * @param {Record<string, unknown>} prediction
 */
function maybeLogTerminalTryonOutput(prediction) {
  const id = prediction?.id != null ? String(prediction.id) : "";
  if (!id || terminalTryonLoggedIds.has(id)) return;
  terminalTryonLoggedIds.add(id);
  if (terminalTryonLoggedIds.size > 2000) terminalTryonLoggedIds.clear();

  const raw = prediction.output;
  if (isTryOnFlowDebug()) {
    console.log("[TRYON OUTPUT RAW]", raw);
    console.log("[REPLICATE FULL OUTPUT]", safeStringifyPredictionOutput(raw));
    let resolvedImage = null;
    try {
      resolvedImage = normalizeModelOutputToUrl(raw);
    } catch (e) {
      resolvedImage = `(normalize_error: ${/** @type {Error} */ (e).message})`;
    }
    console.log("[TRYON RESULT FINAL]");
    console.log("Raw Output:", raw);
    console.log("Resolved Output:", resolvedImage);
  } else {
    console.log("[TRYON] replicate_terminal", { id, output: describeReplicateRawOutput(raw) });
  }
}

/**
 * @param {string} modelRef
 */
function warnIfSuspiciousTryonModel(modelRef) {
  const s = String(modelRef || "").trim().toLowerCase();
  if (!s) return;
  const looksSeg = /(rembg|segment-anything|\bsam\b|mask.?only|cloth.?only|human.?parsing|parsing.?only)/i.test(s);
  const looksVton =
    /(idm-vton|viton|vton|catvton|try-on|tryon|virtual-try|outfit|garment.?transfer)/i.test(s) ||
    s.includes("cuuupid/idm-vton") ||
    s.includes("mmezhov/catvton");
  if (looksSeg || !looksVton) {
    console.warn("[MODEL WARNING] Output may not be a proper try-on composite — use a pinned CATVTON / IDM-VTON / VITON-style model.", {
      modelRef,
    });
  }
}

/**
 * @param {Record<string, unknown>} prediction
 * @param {string} modelRef
 */
function logTryonPredictionCreate(prediction, modelRef) {
  const id = prediction?.id != null ? String(prediction.id) : "?";
  const status = prediction?.status != null ? String(prediction.status) : "?";
  if (!isTryOnFlowDebug()) {
    console.log("[TRYON] prediction_created", { id, modelRef, status });
    return;
  }

  const envModel = (process.env.REPLICATE_TRYON_MODEL || "").trim();
  const envVer = (process.env.REPLICATE_TRYON_VERSION || "").trim();
  const envAlt = (process.env.REPLICATE_MODEL_VERSION || "").trim();
  console.log(
    "[MODEL CHECK]",
    `active_model=${detectTryOnFamily(modelRef)}`,
    envAlt || envModel || "(default)",
    envVer ? `REPLICATE_TRYON_VERSION=${envVer}` : "",
    "→",
    modelRef
  );

  warnIfSuspiciousTryonModel(modelRef);
  const pinnedToDigest = /:[a-f0-9]{64}$/i.test(modelRef);
  if (!pinnedToDigest) {
    console.warn(
      "[MODEL WARNING] Pin a version digest on REPLICATE_TRYON_MODEL (owner/name:64hex) or set REPLICATE_TRYON_VERSION — floating \"latest\" can change behavior."
    );
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[TRYON REQUEST SENT]");
  console.log("Model:", modelRef);
  console.log("Prediction ID:", id);
  console.log("Status:", status);
  console.log("━━━━━━━━━━━━━━━━━━━━━━");
}

/** Latest cuuupid/idm-vton digest (see https://replicate.com/cuuupid/idm-vton/versions ). */
const IDM_VTON_DEFAULT_VERSION = "0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985";

/** Pinned mmezhov/catvton-flux digest (see https://replicate.com/mmezhov/catvton-flux/versions ). */
const CATVTON_DEFAULT_VERSION = "cc41d1b963023987ed2ddf26e9264efcc96ee076640115c303f95b0010f6a958";

const DEFAULT_CATVTON_BASE = "mmezhov/catvton-flux";
const DEFAULT_MODEL_BASE = "cuuupid/idm-vton";
const DEFAULT_TIMEOUT_MS = 420000;
const DEFAULT_POLL_INTERVAL_MS = 2000;

/** Exponential poll delay (ms): 1s → 2s → 4s → 8s → max 10s (per poll attempt after create). */
function getExponentialPollMs(zeroBasedAttempt) {
  return Math.min(10000, 1000 * Math.pow(2, Math.min(zeroBasedAttempt, 4)));
}

class ReplicateTryOnError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, cause?: unknown }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "ReplicateTryOnError";
    this.code = meta.code;
    this.status = meta.status;
    if (meta.cause !== undefined) this.cause = meta.cause;
  }
}

function getCatvtonHfToken() {
  return String(
    process.env.REPLICATE_CATVTON_HF_TOKEN ||
      process.env.HF_TOKEN ||
      process.env.HUGGING_FACE_HUB_TOKEN ||
      process.env.HUGGINGFACE_HUB_TOKEN ||
      ""
  ).trim();
}

function getToken() {
  const t = (process.env.REPLICATE_API_TOKEN || "").trim();
  return t || null;
}

function createClient() {
  const auth = getToken();
  if (!auth) {
    throw new ReplicateTryOnError("REPLICATE_API_TOKEN is not set in backend environment", {
      code: "MISSING_TOKEN",
    });
  }
  return new Replicate({ auth });
}

/**
 * @param {unknown} item
 * @returns {string | null}
 */
function coerceImageUrl(item) {
  if (item == null) return null;
  if (typeof item === "string") {
    const s = item.trim();
    if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    return null;
  }
  if (typeof item === "object") {
    if (typeof item.url === "string") {
      const s = item.url.trim();
      if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    }
    if (typeof item.url === "function") {
      try {
        return item.url().toString();
      } catch {
        return null;
      }
    }
    if (typeof item.toString === "function") {
      const s = String(item.toString()).trim();
      if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    }
  }
  return null;
}

/**
 * @param {unknown} output
 * @returns {string}
 */
function normalizeModelOutputToUrl(output) {
  if (output == null) {
    throw new ReplicateTryOnError("Replicate returned no output", { code: "EMPTY_OUTPUT" });
  }

  const url = extractTryOnResultImageUrl(output, 0);
  if (url) return url;

  if (Array.isArray(output)) {
    throw new ReplicateTryOnError("Replicate returned an array with no usable image URL", {
      code: "BAD_OUTPUT_SHAPE",
    });
  }

  throw new ReplicateTryOnError("Could not resolve image URL from Replicate model output", {
    code: "BAD_OUTPUT_SHAPE",
  });
}

/**
 * Recover human / garment URLs from a Replicate prediction (for exhibition fallback composite).
 * @param {Record<string, unknown>} prediction
 * @returns {{ person: string, cloth: string }}
 */
function extractTryOnInputsFromPrediction(prediction) {
  const input =
    prediction?.input != null && typeof prediction.input === "object"
      ? /** @type {Record<string, unknown>} */ (prediction.input)
      : {};
  const humanField = (process.env.REPLICATE_TRYON_HUMAN_FIELD || "human_img").trim();
  const garmentField = (process.env.REPLICATE_TRYON_GARMENT_FIELD || "garm_img").trim();
  const personRaw =
    input.image ??
    input[humanField] ??
    input.human_img ??
    input.human ??
    input.person ??
    input.model_image;
  const clothRaw =
    input.garment ??
    input[garmentField] ??
    input.garm_img ??
    input.cloth ??
    input.clothing;
  return {
    person: personRaw != null ? String(personRaw).trim() : "",
    cloth: clothRaw != null ? String(clothRaw).trim() : "",
  };
}

/**
 * Prefer real try-on URL; otherwise build a guaranteed demo composite for exhibitions.
 * @param {unknown} output
 * @param {string} inputPersonImage
 * @param {string} inputClothImage
 * @returns {Promise<string>}
 */
async function forceSafeTryOnOutput(output, inputPersonImage, inputClothImage) {
  if (!isExhibitionFallbackEnabled()) {
    const u = normalizeModelOutputToUrl(output);
    if (!isValidTryOn(u)) {
      throw new ReplicateTryOnError("Replicate returned an invalid image URL", { code: "BAD_OUTPUT_SHAPE" });
    }
    return u;
  }

  const person = String(inputPersonImage || "").trim();
  const cloth = String(inputClothImage || "").trim();

  let resolvedUrl = null;
  try {
    resolvedUrl = normalizeModelOutputToUrl(output);
  } catch {
    resolvedUrl = null;
  }

  if (resolvedUrl && !isValidTryOn(resolvedUrl)) {
    resolvedUrl = null;
  }

  if (!person) {
    if (resolvedUrl && isValidTryOn(resolvedUrl)) return resolvedUrl;
    throw new ReplicateTryOnError("Replicate returned no output and no person image for fallback", {
      code: "EMPTY_OUTPUT",
    });
  }

  const finalUrl = await resolveExhibitionFinalImage(resolvedUrl, person, cloth);
  if (!finalUrl || !isValidTryOn(finalUrl)) {
    throw new ReplicateTryOnError("Exhibition fallback could not produce a valid image", {
      code: "EMPTY_OUTPUT",
    });
  }
  return finalUrl;
}

/**
 * Age of prediction since Replicate `created_at` (server clock), or null if unknown.
 * @param {Record<string, unknown>} prediction
 * @returns {number | null}
 */
function getPredictionAgeMs(prediction) {
  const raw = prediction?.created_at ?? prediction?.createdAt;
  if (raw == null) return null;
  const t = new Date(String(raw)).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Date.now() - t);
}

/**
 * Create prediction without Prefer: wait, then poll until done.
 *
 * @param {import("replicate")} replicate
 * @param {string} modelRef
 * @param {Record<string, unknown>} input
 * @param {{
 *   timeoutMs: number,
 *   pollIntervalMs: number,
 *   onProgress?: (p: Record<string, unknown>) => void,
 *   startedAt: number,
 * }} opts
 * @returns {Promise<unknown>}
 */
async function runTryOnPredictionWithPolling(replicate, modelRef, input, opts) {
  const { timeoutMs, onProgress, startedAt } = opts;
  const identifier = ModelVersionIdentifier.parse(modelRef);

  const createOptions = /** @type {Record<string, unknown>} */ ({
    input,
    wait: false,
  });
  if (identifier.version) {
    createOptions.version = identifier.version;
  } else {
    createOptions.model = `${identifier.owner}/${identifier.name}`;
  }

  let prediction = /** @type {Record<string, unknown>} */ (await replicate.predictions.create(createOptions));
  const pid = String(prediction.id || "");
  const st0 = prediction.status != null ? String(prediction.status) : "starting";
  logTryonPredictionCreate(prediction, modelRef);
  registerPredictionOpen(pid, modelRef, st0);
  console.info(`[MODEL] Using pinned version: ${modelRef}`);
  console.info(`[TRYON] id=${pid} status=${st0} elapsed=0s model=${modelRef} poll=0`);

  if (st0 === "succeeded" || st0 === "failed" || st0 === "canceled") {
    ensurePredictionContext(pid, modelRef);
    recordPollAndMaybeLog(pid, prediction, { getPredictionAgeMs });
    if (onProgress) onProgress(prediction);
  } else if (onProgress) {
    onProgress(prediction);
  }

  const deadline = startedAt + timeoutMs;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let pollAttempt = 0;

  for (;;) {
    const st = prediction.status != null ? String(prediction.status) : "";

    if (st === "succeeded" || st === "failed" || st === "canceled") {
      break;
    }

    if (Date.now() > deadline) {
      try {
        await replicate.predictions.cancel(pid);
      } catch (_) {
        /* ignore */
      }
      markPredictionLifecycleEnd(pid, "timeout", modelRef);
      throw new ReplicateTryOnError(`Replicate try-on timed out after ${timeoutMs}ms`, {
        code: "TIMEOUT",
      });
    }

    const delayMs = getExponentialPollMs(pollAttempt);
    await sleep(delayMs);
    pollAttempt += 1;
    prediction = /** @type {Record<string, unknown>} */ (await replicate.predictions.get(pid));
    ensurePredictionContext(pid, modelRef);
    recordPollAndMaybeLog(pid, prediction, { getPredictionAgeMs });
    if (onProgress) onProgress(prediction);
  }

  const finalSt = prediction.status != null ? String(prediction.status) : "";
  if (finalSt === "failed") {
    const detail =
      typeof prediction.error === "string"
        ? prediction.error
        : prediction.error != null
          ? JSON.stringify(prediction.error)
          : "unknown";
    throw new ReplicateTryOnError(`Prediction failed: ${detail}`, { code: "RUN_FAILED" });
  }
  if (finalSt === "canceled") {
    throw new ReplicateTryOnError("Prediction was canceled", { code: "RUN_FAILED" });
  }

  if (finalSt === "succeeded") {
    maybeLogTerminalTryonOutput(prediction);
  }

  return prediction.output;
}

/**
 * Map free-text catalog category to IDM-VTON-style region when possible.
 * @param {string | undefined} raw
 * @returns {'upper_body' | 'lower_body' | 'dresses'}
 */
function inferGarmentCategory(raw) {
  const s = (raw != null ? String(raw) : "").toLowerCase();
  if (/(dress|gown|lehenga|frock|saree|kurta\s*set|outfit|full)/i.test(s)) return "dresses";
  if (/(pant|jean|trouser|skirt|short|lower|bottom|leg)/i.test(s)) return "lower_body";
  return "upper_body";
}

/**
 * Resolve model ref for replicate.run(). Prefer owner/model:version so the client uses
 * POST /predictions (version) instead of POST /models/{model}/predictions (often 404).
 * @returns {string}
 */
function resolveModelRef() {
  let base = (process.env.REPLICATE_TRYON_MODEL || "").trim();
  if (!base) {
    const primary = (process.env.REPLICATE_TRYON_PRIMARY || "catvton").trim().toLowerCase();
    if (primary === "idm-vton" || primary === "idm" || primary === "idm_vton") {
      base = DEFAULT_MODEL_BASE;
    } else {
      base = DEFAULT_CATVTON_BASE;
    }
  }
  if (base.includes(":")) return base;
  const explicit = (process.env.REPLICATE_TRYON_VERSION || "").trim();
  if (explicit) return `${base}:${explicit}`;
  const digest = isCatvtonModelRef(base) ? CATVTON_DEFAULT_VERSION : IDM_VTON_DEFAULT_VERSION;
  return `${base}:${digest}`;
}

/**
 * IDM-VTON (human_img + garm_img) payload — shared by primary IDM path and CATVTON→IDM fallback.
 * @param {string} modelRef
 * @param {string} human
 * @param {string} garment
 * @param {{ categoryHint?: string }} [options]
 */
function buildIdmTryOnPayload(modelRef, human, garment, options = {}) {
  let humanField = (process.env.REPLICATE_TRYON_HUMAN_FIELD || "human_img").trim();
  let garmentField = (process.env.REPLICATE_TRYON_GARMENT_FIELD || "garm_img").trim();
  if (detectTryOnFamily(modelRef) === "idm-vton") {
    if (humanField.toLowerCase() === "human") {
      console.warn(
        '[TRYON] REPLICATE_TRYON_HUMAN_FIELD "human" is not valid for cuuupid/idm-vton on Replicate; using human_img.'
      );
      humanField = "human_img";
    }
  }
  const categoryDefault = (process.env.REPLICATE_TRYON_CATEGORY || "").trim().toLowerCase();
  const category =
    categoryDefault === "upper_body" || categoryDefault === "lower_body" || categoryDefault === "dresses"
      ? categoryDefault
      : inferGarmentCategory(options.categoryHint);
  const input = {
    [humanField]: human,
    [garmentField]: garment,
    category,
    crop: false,
  };
  logTryOnPayloadFinal("idm-vton", modelRef, input);
  return {
    modelRef,
    input,
    human,
    garment,
    category,
    humanField,
    garmentField,
    kind: "idm-vton",
  };
}

/**
 * Build Replicate `input` for the active try-on family (CATVTON-Flux vs IDM-VTON).
 * Inlines localhost/LAN garment URLs as data URLs so Replicate workers can read both inputs.
 *
 * @param {string} personImage
 * @param {string} clothImage
 * @param {{ categoryHint?: string }} [options]
 */
async function buildTryOnPayload(personImage, clothImage, options = {}) {
  let human = (personImage != null ? String(personImage) : "").trim();
  let garment = (clothImage != null ? String(clothImage) : "").trim();

  assertNonEmptyTryOnInputs(human, garment);

  human = await inlineNonPublicHttpUrlForExternalApi(human);
  garment = await inlineNonPublicHttpUrlForExternalApi(garment);

  assertReplicateReadableImageRef("person", human);
  assertReplicateReadableImageRef("garment", garment);

  logTryOnInputRef("[TRYON INPUT PERSON]", human);
  logTryOnInputRef("[TRYON INPUT CLOTH]", garment);

  const modelRef = resolveModelRef();

  if (isCatvtonModelRef(modelRef)) {
    const hf = getCatvtonHfToken();
    if (!hf) {
      console.warn(
        "[TRYON] REPLICATE_CATVTON_HF_TOKEN / HF_TOKEN not set — falling back to pinned IDM-VTON for this request. " +
          "Add a Hugging Face token (FLUX.1-dev terms) to use CATVTON-Flux, or set REPLICATE_TRYON_PRIMARY=idm-vton."
      );
      console.log("[FALLBACK LEVEL]", "catvton_missing_hf_token→idm_vton");
      const idmRef = `${DEFAULT_MODEL_BASE}:${IDM_VTON_DEFAULT_VERSION}`;
      return buildIdmTryOnPayload(idmRef, human, garment, options);
    }
    const width = Math.min(1024, Math.max(256, Number(process.env.REPLICATE_CATVTON_WIDTH || 576) || 576));
    const height = Math.min(1536, Math.max(256, Number(process.env.REPLICATE_CATVTON_HEIGHT || 768) || 768));
    const numSteps = Math.min(60, Math.max(8, Number(process.env.REPLICATE_CATVTON_NUM_STEPS || 32) || 32));
    const guidance = Math.min(50, Math.max(2, Number(process.env.REPLICATE_CATVTON_GUIDANCE_SCALE || 30) || 30));
    const seed = Math.floor(Number(process.env.REPLICATE_CATVTON_SEED || 0) || 0);
    const { image, mask, garment: gUrl } = await buildCatvtonImages(human, garment, { width, height });
    const input = {
      hf_token: hf,
      image,
      mask,
      garment: gUrl,
      try_on: true,
      num_steps: numSteps,
      guidance_scale: guidance,
      seed,
      width,
      height,
    };
    const category = inferGarmentCategory(options.categoryHint);
    logTryOnPayloadFinal("catvton", modelRef, input);
    return {
      modelRef,
      input,
      human,
      garment,
      category,
      humanField: "image",
      garmentField: "garment",
      kind: "catvton",
    };
  }

  return buildIdmTryOnPayload(modelRef, human, garment, options);
}

async function createTryOnPrediction(personImage, clothImage, options = {}) {
  const replicate = createClient();
  const { modelRef, input, category } = await buildTryOnPayload(personImage, clothImage, options);
  const identifier = ModelVersionIdentifier.parse(modelRef);
  const createOptions = { input, wait: false };
  if (identifier.version) createOptions.version = identifier.version;
  else createOptions.model = `${identifier.owner}/${identifier.name}`;

  const prediction = /** @type {Record<string, unknown>} */ (await replicate.predictions.create(createOptions));
  const pid = String(prediction.id);
  const st = String(prediction.status || "starting");
  logTryonPredictionCreate(prediction, modelRef);
  registerPredictionOpen(pid, modelRef, st);
  console.info(`[MODEL] Using pinned version: ${modelRef}`);
  console.info(`[TRYON] id=${pid} status=${st} elapsed=0s model=${modelRef} poll=0`);

  return {
    predictionId: pid,
    status: st,
    createdAt: prediction.created_at ?? prediction.createdAt ?? null,
    category,
    modelRef,
  };
}

async function getTryOnPredictionState(predictionId, options = {}) {
  const replicate = createClient();
  const pidStr = String(predictionId);
  const modelRef = getRegisteredTryOnModelRef(pidStr) || resolveModelRef();
  ensurePredictionContext(pidStr, modelRef);

  const prediction = /** @type {Record<string, unknown>} */ (
    await replicate.predictions.get(String(predictionId))
  );
  recordPollAndMaybeLog(String(predictionId), prediction, { getPredictionAgeMs });

  const startedAt = Number(options.startedAt || Date.now());
  const rawStatus = prediction.status != null ? String(prediction.status) : "starting";

  const out = {
    predictionId: String(prediction.id || predictionId),
    status: rawStatus,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    createdAt: prediction.created_at ?? prediction.createdAt ?? null,
    startedAt: prediction.started_at ?? prediction.startedAt ?? null,
    completedAt: prediction.completed_at ?? prediction.completedAt ?? null,
  };
  if (rawStatus === "succeeded") {
    maybeLogTerminalTryonOutput(prediction);
    const { person, cloth } = extractTryOnInputsFromPrediction(prediction);
    let url = await forceSafeTryOnOutput(prediction.output, person, cloth);
    if (!isValidTryOn(url)) {
      console.warn("[TRYON] post-model output failed validation — rebuilding via exhibition chain");
      try {
        url = await resolveExhibitionFinalImage(null, person, cloth);
      } catch (e) {
        console.error("[TRYON] chain rebuild failed", e);
        url = "";
      }
    }
    if (!isValidTryOn(url)) {
      url = "";
    }
    out.output = url;
  }
  if (rawStatus === "failed" || rawStatus === "canceled") {
    out.error =
      typeof prediction.error === "string"
        ? prediction.error
        : prediction.error != null
          ? JSON.stringify(prediction.error)
          : "Prediction failed";
  }
  return out;
}

/**
 * Run virtual try-on on Replicate (default primary: CATVTON-Flux; IDM-VTON when configured).
 *
 * @param {string} personImage - Public https URL or data:image/* URL of the person
 * @param {string} clothImage - Public https URL or data:image/* URL of the garment
 * @param {{ categoryHint?: string }} [options] - optional hints from catalog / request
 * @returns {Promise<string>} HTTPS or data URL of the generated composite image
 */
async function generateTryOn(personImage, clothImage, options = {}) {
  const payload = await buildTryOnPayload(personImage, clothImage, options);
  const { modelRef, input, category, humanField, garmentField, human, garment } = payload;
  const timeoutMs = Number(process.env.REPLICATE_TRYON_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const replicate = createClient();

  const startedAt = Date.now();
  const pollIntervalMs =
    Number(process.env.REPLICATE_TRYON_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS) ||
    DEFAULT_POLL_INTERVAL_MS;

  const idRef = { lastId: /** @type {string | null} */ (null) };
  const onProgress = (/** @type {Record<string, unknown>} */ p) => {
    if (p && p.id != null) idRef.lastId = String(p.id);
  };

  console.info("[TRYON] try_on_start", { model: modelRef, category, timeoutMs });

  try {
    const rawOutput = await runTryOnPredictionWithPolling(replicate, modelRef, input, {
      timeoutMs,
      pollIntervalMs,
      onProgress,
      startedAt,
    });
    if (isTryOnFlowDebug()) {
      console.info("[try-on flow] replicate raw output", describeReplicateRawOutput(rawOutput));
    }
    const url = await forceSafeTryOnOutput(rawOutput, human, garment);
    if (isTryOnFlowDebug()) {
      console.info("[try-on flow] replicate normalized image url", {
        length: url.length,
        prefix: url.slice(0, 120),
      });
    }
    const totalDurationMs = Date.now() - startedAt;
    if (isTryOnFlowDebug()) {
      console.info("[replicate] try-on prediction completed", {
        predictionId: idRef.lastId,
        totalDurationMs,
        status: "succeeded",
        resultPrefix: url.slice(0, 48),
      });
    } else {
      console.info("[TRYON] try_on_done", { predictionId: idRef.lastId, totalDurationMs });
    }
    return url;
  } catch (err) {
    const totalDurationMs = Date.now() - startedAt;
    const status = err?.response?.status ?? err?.status;
    const detail = err?.message || String(err);

    if (err instanceof ReplicateTryOnError && err.code === "TIMEOUT") {
      console.error("[replicate] try-on prediction failed", {
        predictionId: idRef.lastId,
        totalDurationMs,
        status: "timeout",
        message: detail,
      });
    } else {
      console.error("[replicate] try-on prediction failed", {
        predictionId: idRef.lastId,
        totalDurationMs,
        status: "error",
        httpStatus: status,
        message: detail,
      });
    }

    if (status === 404) {
      throw new ReplicateTryOnError(
        "Replicate model not found (404). Pin a version: set REPLICATE_TRYON_MODEL=owner/name:64char_digest or set REPLICATE_TRYON_VERSION.",
        { code: "MODEL_NOT_FOUND", status, cause: err }
      );
    }
    if (status === 401 || status === 403) {
      throw new ReplicateTryOnError("Replicate authentication failed — check REPLICATE_API_TOKEN", {
        code: "AUTH_FAILED",
        status,
        cause: err,
      });
    }
    if (status === 402 || detail.toLowerCase().includes("insufficient credit")) {
      throw new ReplicateTryOnError("Replicate account billing / credit issue", {
        code: "BILLING",
        status,
        cause: err,
      });
    }
    if (status === 429) {
      throw new ReplicateTryOnError("Replicate rate limit exceeded — retry shortly", {
        code: "RATE_LIMIT",
        status,
        cause: err,
      });
    }

    if (
      isExhibitionFallbackEnabled() &&
      String(personImage || "").trim() &&
      String(clothImage || "").trim() &&
      err instanceof ReplicateTryOnError &&
      (err.code === "TIMEOUT" || err.code === "RUN_FAILED")
    ) {
      console.warn("[TRYON] Replicate failed — exhibition local fallback", { code: err.code });
      try {
        return await resolveExhibitionFinalImage(null, personImage, clothImage);
      } catch (fe) {
        console.error("[TRYON] local exhibition fallback failed", fe);
      }
    }

    if (err instanceof ReplicateTryOnError) throw err;

    throw new ReplicateTryOnError(`Replicate try-on failed: ${detail}`, {
      code: "RUN_FAILED",
      status,
      cause: err,
    });
  }
}

function isReplicateConfigured() {
  return Boolean(getToken());
}

module.exports = {
  generateTryOn,
  createTryOnPrediction,
  getTryOnPredictionState,
  getExponentialPollMs,
  getResolvedModelRef: resolveModelRef,
  isReplicateConfigured,
  ReplicateTryOnError,
  isValidTryOn,
  /** @deprecated alias — same as isValidTryOn */
  isValidTryOnResultUrl: isValidTryOn,
};
