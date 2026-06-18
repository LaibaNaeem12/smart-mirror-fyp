/**
 * Exhibition-only deterministic fallback ordering:
 *   L1 Replicate candidate (already normalized)
 *   L2 ComfyUI (bridge or direct workflow)
 *   L3 Smart pose overlay → Sharp (createExhibitionFallbackImage)
 *   L4 Sharp center composite (createDemoComposite)
 */

const { runComfyTryOn, isComfyTryOnConfigured, isComfyExecutionEnabled } = require("../services/comfyTryOnService");
const { createExhibitionFallbackImage } = require("./tryOnSmartPoseOverlay");
const { createDemoComposite, getTryOnExhibitionPlaceholderDataUrl } = require("./tryOnDemoComposite");
const { isValidFinalTryOnImage } = require("./tryOnFinalImageValidator");

function logFallbackFlow(step, status, reason) {
  const r = reason ? `reason=${reason}` : "";
  console.log("[FALLBACK FLOW]", `step=${step}`, `status=${status}`, r);
}

function logFinalSelected(source, valid) {
  console.log("[FINAL IMAGE SELECTED]", `source=${source}`, `valid=${valid}`);
}

/**
 * @param {string | null} replicateCandidate
 * @param {string} person
 * @param {string} garment
 * @returns {Promise<string>}
 */
async function resolveExhibitionFinalImage(replicateCandidate, person, garment) {
  const p = String(person || "").trim();
  const g = String(garment || "").trim();

  const tryL1 = String(replicateCandidate || "").trim();
  if (tryL1 && isValidFinalTryOnImage(tryL1, p, g, { requireTryOnHeuristic: Boolean(p && g) })) {
    logFallbackFlow("replicate", "success", "");
    logFinalSelected("replicate", true);
    return tryL1;
  }
  if (tryL1) logFallbackFlow("replicate", "failed", "invalid_image");

  if (!p || !g) {
    logFallbackFlow("comfyui", "skipped", "buffer_empty");
  } else if (!isComfyExecutionEnabled()) {
    logFallbackFlow("comfyui", "skipped", "ENABLE_COMFYUI_not_set");
  } else if (!isComfyTryOnConfigured()) {
    logFallbackFlow("comfyui", "skipped", "not_configured");
  } else {
    logFallbackFlow("comfyui", "attempt", "queue");
    const comfyOut = await runComfyTryOn(p, g);
    if (comfyOut && isValidFinalTryOnImage(comfyOut, p, g, { requireTryOnHeuristic: false })) {
      logFallbackFlow("comfyui", "success", "");
      logFinalSelected("comfyui", true);
      return comfyOut;
    }
    logFallbackFlow("comfyui", "failed", comfyOut ? "invalid_image" : "empty_output");
  }

  if (p && g) {
    logFallbackFlow("pose", "attempt", "overlay");
    try {
      const poseSharp = await createExhibitionFallbackImage(p, g);
      if (poseSharp && isValidFinalTryOnImage(poseSharp, p, g, { requireTryOnHeuristic: false })) {
        logFallbackFlow("pose", "success", "");
        logFinalSelected("pose_or_sharp_composite", true);
        return poseSharp;
      }
    } catch (e) {
      logFallbackFlow("pose", "failed", String(e?.message || e).slice(0, 80));
    }
  } else {
    logFallbackFlow("pose", "failed", "buffer_empty");
  }

  logFallbackFlow("sharp", "success", "attempt");
  const sharpOut = await createDemoComposite(p, g);
  const ok = Boolean(sharpOut && isValidFinalTryOnImage(sharpOut, p, g, { requireTryOnHeuristic: false }));
  logFinalSelected("sharp", ok);
  if (ok) return sharpOut;

  const placeholder = await getTryOnExhibitionPlaceholderDataUrl();
  logFinalSelected("placeholder", true);
  return placeholder;
}

module.exports = {
  resolveExhibitionFinalImage,
  logFallbackFlow,
  logFinalSelected,
};
