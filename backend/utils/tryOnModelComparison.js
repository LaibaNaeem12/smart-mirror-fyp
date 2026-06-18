/**
 * In-process rolling stats for try-on model comparison (exhibition / ops).
 * Not persisted across restarts.
 */

/** @typedef {{ n: number, ok: number, fail: number, cold: number, queueSum: number, procSum: number, withQueue: number, withProc: number }} TryOnAgg */

/** @type {Map<string, TryOnAgg>} */
const byModel = new Map();

/** @type {Set<string>} */
const observationDedupe = new Set();

/**
 * @param {string} modelRef
 * @param {{
 *   outcome: 'succeeded' | 'failed' | 'canceled' | 'cold_composite' | 'timeout',
 *   queueMs?: number | null,
 *   processingMs?: number | null,
 * }} evt
 * @param {string} [predictionId] - when set, dedupe repeated polls for the same terminal outcome
 */
function recordTryonModelObservation(modelRef, evt, predictionId) {
  if (predictionId) {
    const key = `${String(predictionId).trim()}:${evt.outcome}`;
    if (observationDedupe.has(key)) return;
    observationDedupe.add(key);
    if (observationDedupe.size > 8000) observationDedupe.clear();
  }
  const ref = String(modelRef || "unknown").trim() || "unknown";
  let s = byModel.get(ref);
  if (!s) {
    s = { n: 0, ok: 0, fail: 0, cold: 0, queueSum: 0, procSum: 0, withQueue: 0, withProc: 0 };
  }

  s.n += 1;
  if (evt.outcome === "succeeded" || evt.outcome === "cold_composite") {
    s.ok += 1;
  } else if (evt.outcome === "failed" || evt.outcome === "canceled" || evt.outcome === "timeout") {
    s.fail += 1;
  }
  if (evt.outcome === "cold_composite") {
    s.cold += 1;
  }
  if (evt.queueMs != null && Number.isFinite(evt.queueMs)) {
    s.queueSum += evt.queueMs;
    s.withQueue += 1;
  }
  if (evt.processingMs != null && Number.isFinite(evt.processingMs)) {
    s.procSum += evt.processingMs;
    s.withProc += 1;
  }

  byModel.set(ref, s);

  const successRate = s.n ? Number((s.ok / s.n).toFixed(4)) : null;
  const avgStartup = s.withQueue ? Math.round(s.queueSum / s.withQueue) : null;
  const avgProc = s.withProc ? Math.round(s.procSum / s.withProc) : null;

  console.info("[TRYON MODEL COMPARISON]", {
    active_model: ref,
    observations: s.n,
    success_rate: successRate,
    cold_composite_count: s.cold,
    avg_startup_queue_ms: avgStartup,
    avg_processing_ms: avgProc,
    last_outcome: evt.outcome,
  });
}

module.exports = { recordTryonModelObservation };
