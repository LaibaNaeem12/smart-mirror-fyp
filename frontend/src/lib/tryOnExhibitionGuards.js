/**
 * Exhibition try-on: validate AI URLs, dedupe polls, first-valid-wins lock per predictionId,
 * long-run memory hygiene (reassign Maps, periodic expiry).
 */

/** @param {unknown} url */
export function isValidTryOnOutput(url) {
  if (url == null || typeof url !== "string") return false;
  const t = url.trim();
  if (t.length < 32) return false;
  return t.startsWith("http") || t.startsWith("data:image");
}

/** predictionId -> lock timestamp (ms). Replaced wholesale on reset / cleanup (GC-friendly). */
let tryOnFinalImageLocks = new Map();

/** Last activity per prediction (for orphan cleanup during long kiosk runs). */
let predictionActivityMs = new Map();

/**
 * @param {string} predictionId
 */
export function recordPredictionActivity(predictionId) {
  const id = String(predictionId || "").trim();
  if (!id) return;
  predictionActivityMs.set(id, Date.now());
}

/** Drop all per-prediction locks (new Map — no incremental delete). */
export function resetTryOnFinalImageLocks() {
  tryOnFinalImageLocks = new Map();
  predictionActivityMs = new Map();
}

/** Remove lock entries older than maxAgeMs (default 45m). */
export function cleanupExpiredLocks(maxAgeMs = 45 * 60 * 1000) {
  const now = Date.now();
  const next = new Map();
  for (const [id, ts] of tryOnFinalImageLocks) {
    if (now - ts <= maxAgeMs) next.set(id, ts);
  }
  tryOnFinalImageLocks = next;
}

/** Trim activity map of ids not touched within maxAgeMs. */
export function cleanupOldPredictionRefs(maxAgeMs = 45 * 60 * 1000) {
  const now = Date.now();
  const next = new Map();
  for (const [id, ts] of predictionActivityMs) {
    if (now - ts <= maxAgeMs) next.set(id, ts);
  }
  predictionActivityMs = next;
}

/**
 * @param {string} predictionId
 * @returns {boolean}
 */
export function isTryOnFinalImageLocked(predictionId) {
  const id = String(predictionId || "").trim();
  return tryOnFinalImageLocks.has(id);
}

/**
 * @param {string} predictionId
 * @returns {boolean} true if this prediction was not yet locked (caller should apply image)
 */
export function tryLockTryOnFinalImage(predictionId) {
  const id = String(predictionId || "").trim();
  if (!id) return false;
  if (tryOnFinalImageLocks.has(id)) return false;
  const ts = Date.now();
  tryOnFinalImageLocks.set(id, ts);
  recordPredictionActivity(id);
  return true;
}
