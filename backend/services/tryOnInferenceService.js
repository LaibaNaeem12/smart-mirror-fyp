/**
 * Try-on inference boundary — all ML / external AI (e.g. Replicate) calls go through here.
 *
 * Environment:
 *   AI_TRYON_SERVICE_URL — optional base URL (no trailing slash) of a worker that accepts POST /tryon
 *   AI_TRYON_SERVICE_TIMEOUT_MS — optional fetch timeout (default 120000)
 *   REPLICATE_API_TOKEN — optional; when set (and no worker URL), runs virtual try-on via Replicate
 *     (see services/replicateService.js). Token must stay server-side only.
 *
 * Expected worker contract (when AI_TRYON_SERVICE_URL is set):
 *   POST {AI_TRYON_SERVICE_URL}/tryon
 *   Body: JSON {
 *     garmentImageUrl: string,
 *     personImageDataUrl?: string,
 *     clothId?, mode?, gender?, category?
 *   }
 *   Response: JSON { processedImageUrl: string } OR { processedImage: string } (URL, path, or data:image URL)
 *
 * Without a worker: Replicate runs when REPLICATE_API_TOKEN is set (and a person image is present);
 * otherwise garment-only passthrough, or person + garment mock until a worker is connected.
 */

const { generateTryOn, isReplicateConfigured } = require("./replicateService");
const { isExhibitionFallbackEnabled } = require("../utils/tryOnDemoComposite");
const { resolveExhibitionFinalImage } = require("../utils/tryOnExhibitionFallbackChain");
const { isValidFinalTryOnImage } = require("../utils/tryOnFinalImageValidator");

const DEFAULT_TIMEOUT_MS = 120000;

function passthroughGarment(garmentImageUrl) {
  return {
    originalImage: garmentImageUrl,
    processedImage: garmentImageUrl,
    status: "passthrough",
  };
}

/**
 * Mock try-on: live capture as "before", catalog garment as "after" (when Replicate is off or skipped).
 */
function mockPersonAndGarment(personImageDataUrl, garmentImageUrl) {
  return {
    originalImage: personImageDataUrl,
    processedImage: garmentImageUrl,
    status: "ok",
  };
}

async function runRemoteTryOn(serviceBase, payload, signal) {
  const base = String(serviceBase).replace(/\/$/, "");
  const url = `${base}/tryon`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `AI try-on service HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`
    );
  }

  const data = await res.json();
  const processed =
    data?.processedImageUrl ?? data?.processedImage ?? data?.outputUrl ?? null;
  if (typeof processed !== "string" || !processed.trim()) {
    throw new Error("AI try-on service returned no processedImageUrl");
  }

  const original =
    typeof data?.originalImageUrl === "string" && data.originalImageUrl.trim()
      ? data.originalImageUrl.trim()
      : payload.personImageDataUrl || payload.garmentImageUrl;

  return {
    originalImage: original,
    processedImage: processed.trim(),
    status: "success",
  };
}

/**
 * @param {object} input
 * @param {string} input.garmentImageUrl - absolute URL to catalog garment asset
 * @param {string | null} [input.personImageDataUrl] - data URL of webcam capture (optional)
 * @param {object} [input.meta]
 * @param {string} [input.meta.clothId]
 * @param {string} [input.meta.mode]
 * @param {string} [input.meta.gender]
 * @param {string} [input.meta.category]
 */
async function runTryOnInference({ garmentImageUrl, personImageDataUrl = null, meta = {} }) {
  const serviceUrl = (process.env.AI_TRYON_SERVICE_URL || "").trim();

  if (!serviceUrl) {
    const garment = (garmentImageUrl != null ? String(garmentImageUrl) : "").trim();
    const canUseGarmentForReplicate = /^https?:\/\//i.test(garment) || /^data:image\//i.test(garment);

    if (
      isReplicateConfigured() &&
      personImageDataUrl &&
      /^data:image\//i.test(personImageDataUrl) &&
      canUseGarmentForReplicate
    ) {
      const processedImage = await generateTryOn(personImageDataUrl, garment, {
        categoryHint: meta.category,
      });
      let out = processedImage;
      if (!isValidFinalTryOnImage(out, personImageDataUrl, garment, { requireTryOnHeuristic: Boolean(garment) })) {
        out = await resolveExhibitionFinalImage(processedImage, personImageDataUrl, garment);
      }
      return {
        originalImage: personImageDataUrl,
        processedImage: out,
        status: "success",
      };
    }

    if (personImageDataUrl && /^data:image\//i.test(personImageDataUrl)) {
      if (isExhibitionFallbackEnabled() && canUseGarmentForReplicate) {
        try {
          const processedImage = await resolveExhibitionFinalImage(null, personImageDataUrl, garment);
          if (
            processedImage &&
            isValidFinalTryOnImage(processedImage, personImageDataUrl, garment, { requireTryOnHeuristic: false })
          ) {
            return {
              originalImage: personImageDataUrl,
              processedImage,
              status: "success",
            };
          }
        } catch (e) {
          console.warn("[TRYON FALLBACK] exhibition chain failed", e?.message || e);
        }
      }
      return mockPersonAndGarment(personImageDataUrl, garmentImageUrl);
    }
    return passthroughGarment(garmentImageUrl);
  }

  const timeoutMs = Number(process.env.AI_TRYON_SERVICE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await runRemoteTryOn(
      serviceUrl,
      {
        garmentImageUrl,
        personImageDataUrl: personImageDataUrl || undefined,
        clothId: meta.clothId,
        mode: meta.mode,
        gender: meta.gender,
        category: meta.category,
      },
      controller.signal
    );
  } finally {
    clearTimeout(t);
  }
}

module.exports = { runTryOnInference, passthroughGarment, mockPersonAndGarment };
