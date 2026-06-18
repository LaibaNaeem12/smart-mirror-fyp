/**
 * In-memory metrics for async try-on predictions (single-node process).
 * Keys expire on terminal status to avoid unbounded growth.
 */

const { recordTryonModelObservation } = require("./tryOnModelComparison");
/** @typedef {{ modelRef: string, openedAt: number, pollCount: number, lastStatus: string | null, stuckStartingLogged: boolean }} TryOnCtx */

/** @type {Map<string, TryOnCtx>} */
const ctxByPredictionId = new Map();

function isTryOnFlowDebug() {
  return String(process.env.TRY_ON_FLOW_DEBUG || "").trim() === "true";
}

const STUCK_STARTING_MS = 60_000;

/**
 * @param {string} predictionId
 * @param {string} modelRef
 * @param {string} initialStatus
 */
function registerPredictionOpen(predictionId, modelRef, initialStatus) {
  const id = String(predictionId || "").trim();
  if (!id) return;
  ctxByPredictionId.set(id, {
    modelRef: String(modelRef || ""),
    openedAt: Date.now(),
    pollCount: 0,
    lastStatus: initialStatus || null,
    stuckStartingLogged: false,
  });
}

/**
 * Ensure metrics exist (e.g. first poll hit this server cold).
 * @param {string} predictionId
 * @param {string} modelRef
 */
function ensurePredictionContext(predictionId, modelRef) {
  const id = String(predictionId || "").trim();
  if (!id) return;
  if (!ctxByPredictionId.has(id)) {
    registerPredictionOpen(id, modelRef, "unknown");
  }
}

/**
 * Model ref recorded when the prediction was created (async try-on). Used so polls
 * after CATVTON→IDM fallback still attribute to the model that actually ran.
 * @param {string} predictionId
 * @returns {string | null}
 */
function getRegisteredTryOnModelRef(predictionId) {
  const id = String(predictionId || "").trim();
  if (!id) return null;
  const ctx = ctxByPredictionId.get(id);
  const ref = ctx?.modelRef?.trim();
  if (!ref || ref === "?") return null;
  return ref;
}

/**
 * @param {string} predictionId
 * @param {Record<string, unknown>} prediction - Replicate prediction object
 * @param {{ getPredictionAgeMs: (p: Record<string, unknown>) => number | null }} helpers
 * @returns {{ pollCount: number, terminal: boolean }}
 */
function recordPollAndMaybeLog(predictionId, prediction, helpers) {
  const id = String(predictionId || "").trim();
  const status = prediction?.status != null ? String(prediction.status) : "unknown";
  let ctx = ctxByPredictionId.get(id);
  if (!ctx) {
    ctx = {
      modelRef: "?",
      openedAt: Date.now(),
      pollCount: 0,
      lastStatus: null,
      stuckStartingLogged: false,
    };
    ctxByPredictionId.set(id, ctx);
  }

  ctx.pollCount += 1;
  const ageMs = helpers.getPredictionAgeMs(prediction);
  const ageSec = ageMs == null ? "n/a" : (ageMs / 1000).toFixed(2);
  const terminal = status === "succeeded" || status === "failed" || status === "canceled";
  const statusChanged = status !== ctx.lastStatus;

  if (!terminal && (statusChanged || ctx.pollCount === 1)) {
    console.info(`[TRYON] id=${id} status=${status} elapsed=${ageSec}s model=${ctx.modelRef} poll=${ctx.pollCount}`);
  }

  if (status === "starting" && ageMs != null && ageMs > STUCK_STARTING_MS && !ctx.stuckStartingLogged) {
    ctx.stuckStartingLogged = true;
    console.warn(
      `[TRYON WARNING] id=${id} POSSIBLE_GPU_QUEUE_OR_COLD_START — status=starting elapsed=${(ageMs / 1000).toFixed(1)}s model=${ctx.modelRef}`
    );
  }

  if (status !== ctx.lastStatus) {
    if (isTryOnFlowDebug()) {
      const ts = {
        created_at: prediction.created_at ?? prediction.createdAt ?? null,
        started_at: prediction.started_at ?? prediction.startedAt ?? null,
        completed_at: prediction.completed_at ?? prediction.completedAt ?? null,
      };
      console.info(`[TRYON] id=${id} status_transition ${ctx.lastStatus ?? "∅"} → ${status}`, ts);
    }
    ctx.lastStatus = status;
  }

  if (terminal) {
    const totalMs = Date.now() - ctx.openedAt;
    const startedAtRaw = prediction.started_at ?? prediction.startedAt;
    const completedAtRaw = prediction.completed_at ?? prediction.completedAt;
    const queueMs =
      startedAtRaw && prediction.created_at
        ? Math.max(0, new Date(String(startedAtRaw)).getTime() - new Date(String(prediction.created_at)).getTime())
        : null;
    const processingMs =
      completedAtRaw && startedAtRaw
        ? Math.max(0, new Date(String(completedAtRaw)).getTime() - new Date(String(startedAtRaw)).getTime())
        : null;

    const outcome = status === "canceled" ? "canceled" : status;
    if (isTryOnFlowDebug()) {
      console.info(`[TRYON COMPLETE] id=${id} outcome=${outcome} total_client_window_ms=${Math.round(totalMs)} polling_count=${ctx.pollCount} model=${ctx.modelRef}`, {
        queue_time_ms: queueMs,
        processing_time_ms: processingMs,
        replicate_timestamps: {
          created_at: prediction.created_at ?? prediction.createdAt ?? null,
          started_at: startedAtRaw ?? null,
          completed_at: completedAtRaw ?? null,
        },
        error: prediction.error ?? null,
      });
    } else {
      console.info(
        `[TRYON] id=${id} outcome=${outcome} total_ms=${Math.round(totalMs)} polls=${ctx.pollCount} model=${ctx.modelRef}`
      );
    }
    try {
      const obs =
        status === "succeeded" ? "succeeded" : status === "canceled" ? "canceled" : "failed";
      recordTryonModelObservation(ctx.modelRef, {
        outcome: obs,
        queueMs,
        processingMs,
      }, id);
    } catch (_) {
      /* ignore */
    }
    ctxByPredictionId.delete(id);
  }

  return { pollCount: ctx.pollCount, terminal };
}

/**
 * @param {string} predictionId
 * @param {string} outcome
 * @param {string} [modelRef]
 */
function markPredictionLifecycleEnd(predictionId, outcome, modelRef = "?") {
  const id = String(predictionId || "").trim();
  if (!id) return;
  const ctx = ctxByPredictionId.get(id);
  const totalMs = ctx ? Date.now() - ctx.openedAt : null;
  const polls = ctx?.pollCount ?? null;
  console.info(
    `[TRYON] lifecycle_end id=${id} outcome=${outcome} total_ms=${totalMs ?? "n/a"} polls=${polls ?? "n/a"} model=${modelRef}`
  );
  if (outcome === "timeout") {
    try {
      recordTryonModelObservation(modelRef, { outcome: "timeout" });
    } catch (_) {
      /* ignore */
    }
  }
  ctxByPredictionId.delete(id);
}

module.exports = {
  registerPredictionOpen,
  ensurePredictionContext,
  getRegisteredTryOnModelRef,
  recordPollAndMaybeLog,
  markPredictionLifecycleEnd,
  STUCK_STARTING_MS,
};
