const mongoose = require("mongoose");
const Cloth = require("../models/Cloth");
const { absoluteAssetUrl } = require("../utils/absoluteAssetUrl");
const { runTryOnInference } = require("../services/tryOnInferenceService");
const {
  ReplicateTryOnError,
  isReplicateConfigured,
  createTryOnPrediction,
  getTryOnPredictionState,
} = require("../services/replicateService");
const { normalizeWebcamImage } = require("../utils/normalizeWebcamImage");
const { optimizePersonImageForReplicate } = require("../utils/optimizePersonImageForReplicate");
const { isDbConnected } = require("../dbState");
const { createDemoComposite } = require("../utils/tryOnDemoComposite");
const { resolveExhibitionFinalImage } = require("../utils/tryOnExhibitionFallbackChain");
const { isValidFinalTryOnImage } = require("../utils/tryOnFinalImageValidator");

const { isValidObjectId } = mongoose;

/** Legacy dev catalog: numeric clothId → dataset path (only when clothId is not a Mongo ObjectId). */
const DEV_NUMERIC_CATALOG = {
  1: "/dataset/men/tops/men_shirt_001.png",
  2: "/dataset/men/tops/men_shirt_002.png",
  3: "/dataset/men/tops/men_shirt_003.png",
  4: "/dataset/men/tops/men_shirt_004.png",
  5: "/dataset/men/tops/men_shirt_005.png",
  6: "/dataset/men/tops/men_shirt_006.png",
  7: "/dataset/men/tops/men_shirt_007.png",
  8: "/dataset/men/tops/men_shirt_008.png",
  9: "/dataset/men/tops/men_tshirt_001.png",
  10: "/dataset/men/tops/men_tshirt_002.png",
  11: "/dataset/men/outerwear/men_jacket_001.png",
  12: "/dataset/men/outerwear/men_jacket_002.png",
};

function tryDevNumericCloth(clothId) {
  let n = null;
  if (typeof clothId === "number" && Number.isInteger(clothId) && clothId > 0) {
    n = clothId;
  } else if (typeof clothId === "string") {
    const t = clothId.trim();
    if (/^\d+$/.test(t)) n = parseInt(t, 10);
  }
  if (n == null || n < 1) return null;
  const relativePath = DEV_NUMERIC_CATALOG[n];
  if (!relativePath) return null;
  return { clothId: String(n), relativePath };
}

function isMongoObjectIdString(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  return s.length === 24 && /^[a-fA-F0-9]{24}$/.test(s) && isValidObjectId(s);
}

function normalizeProcessedUrl(req, url) {
  if (url == null) return url;
  const s = String(url).trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:image\//i.test(s)) return s;
  return absoluteAssetUrl(req, s);
}

function normalizeClientTryOnStatus(s) {
  const x = String(s || "").toLowerCase();
  if (x === "ok" || x === "") return "success";
  if (x === "passthrough") return "fallback";
  return s || "success";
}

function isTryOnFlowDebug() {
  return String(process.env.TRY_ON_FLOW_DEBUG || "").trim() === "true";
}

function summarizeDataUrlForLog(dataUrl) {
  if (typeof dataUrl !== "string" || !/^data:image\//i.test(dataUrl)) {
    return { format: "n/a", bytes: null, kb: null, mb: null, chars: 0 };
  }
  const m = /^data:image\/([\w+.-]+);base64,/i.exec(dataUrl);
  const format = m ? m[1].toLowerCase() : "unknown";
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  let bytes = null;
  try {
    bytes = Buffer.from(b64, "base64").length;
  } catch {
    bytes = null;
  }
  return {
    format,
    bytes,
    kb: bytes != null ? Number((bytes / 1024).toFixed(1)) : null,
    mb: bytes != null ? Number((bytes / (1024 * 1024)).toFixed(3)) : null,
    chars: dataUrl.length,
  };
}

/** @param {string} name @param {unknown} value */
function summarizeTryOnImageField(name, value) {
  if (value == null || value === "") {
    return { field: name, absent: true };
  }
  const s = String(value);
  const data = /^data:image\//i.test(s);
  const http = /^https?:\/\//i.test(s);
  const kind = data ? "data_url" : http ? "https" : "relative_or_other";
  return { field: name, kind, length: s.length, prefix: s.slice(0, 96) };
}

/**
 * Fast Sharp overlay for instant exhibition preview (before Replicate returns).
 * @param {string} personDataUrl
 * @param {string} garmentUrl
 * @returns {Promise<string>}
 */
async function buildInstantTryOnPreview(personDataUrl, garmentUrl) {
  const p = String(personDataUrl || "").trim();
  const g = String(garmentUrl || "").trim();
  if (!p) return "";
  if (!g) return p;
  try {
    return await createDemoComposite(p, g);
  } catch (e) {
    console.warn("[TRYON] instant preview composite failed — using person frame only", e?.message || e);
    return p;
  }
}

const tryOn = async (req, res) => {
  const body = req.body || {};
  const { clothId, mode, gender, category, webcamImage } = body;
  const personImageDataUrl = normalizeWebcamImage(webcamImage);
  if (webcamImage != null && String(webcamImage).trim() !== "" && !personImageDataUrl) {
    return res.status(400).json({ message: "Invalid webcamImage (use data URL or base64 JPEG/PNG/WebP)" });
  }

  if (
    clothId === undefined ||
    clothId === null ||
    (typeof clothId === "string" && clothId.trim() === "")
  ) {
    return res.status(400).json({ message: "clothId is required" });
  }

  try {
    const asString = typeof clothId === "string" ? clothId.trim() : String(clothId);

    let personForTryOn = personImageDataUrl;
    if (personImageDataUrl) {
      console.info("[TRYON INPUT] webcam_before_optimize", summarizeDataUrlForLog(personImageDataUrl));
      const { dataUrl, meta } = await optimizePersonImageForReplicate(personImageDataUrl);
      console.info("[TRYON INPUT] webcam_after_optimize", meta);
      personForTryOn = dataUrl;
    }

    let resolved = null;
    if (isMongoObjectIdString(asString)) {
      if (!isDbConnected()) {
        return res.status(503).json({
          message:
            "Catalog database is unavailable, so this garment id cannot be resolved. Fix MongoDB or use a demo numeric clothId.",
        });
      }
      const cloth = await Cloth.findById(asString).lean();
      if (!cloth) {
        return res.status(404).json({ message: "Cloth not found" });
      }
      resolved = { clothId: cloth._id.toString(), relativePath: cloth.imageUrl };
    } else {
      const dev = tryDevNumericCloth(clothId);
      if (!dev) {
        return res.status(404).json({ message: "Cloth not found" });
      }
      resolved = dev;
    }

    const garmentImageUrl = absoluteAssetUrl(req, resolved.relativePath);
    const shouldUseAsyncReplicate =
      isReplicateConfigured() &&
      !!personForTryOn &&
      /^data:image\//i.test(personForTryOn) &&
      /^https?:\/\//i.test(String(garmentImageUrl || ""));

    if (shouldUseAsyncReplicate) {
      const requestStartedAt = Date.now();
      const previewImage = await buildInstantTryOnPreview(personForTryOn, garmentImageUrl);
      const kickoff = await createTryOnPrediction(personForTryOn, garmentImageUrl, {
        categoryHint: category != null ? String(category) : undefined,
      });
      const instant =
        typeof previewImage === "string" && /^data:image\//i.test(previewImage.trim())
          ? previewImage.trim()
          : personForTryOn;
      let processedOut = instant;
      if (
        !isValidFinalTryOnImage(processedOut, personForTryOn, garmentImageUrl, {
          requireTryOnHeuristic: false,
        })
      ) {
        processedOut = await resolveExhibitionFinalImage(null, personForTryOn, garmentImageUrl);
      }
      return res.status(202).json({
        clothId: resolved.clothId,
        originalImage: personForTryOn,
        previewImage: processedOut,
        processedImage: processedOut,
        status: "instant_preview",
        predictionId: kickoff.predictionId,
        startedAt: requestStartedAt,
        replicateStatus: kickoff.status,
      });
    }

    const inference = await runTryOnInference({
      garmentImageUrl,
      personImageDataUrl: personForTryOn,
      meta: {
        clothId: resolved.clothId,
        mode: mode != null ? String(mode) : undefined,
        gender: gender != null ? String(gender) : undefined,
        category: category != null ? String(category) : undefined,
      },
    });

    const processedOutRaw = normalizeProcessedUrl(req, inference.processedImage);
    const originalOut =
      typeof inference.originalImage === "string" && /^data:image\//i.test(inference.originalImage)
        ? inference.originalImage
        : normalizeProcessedUrl(req, inference.originalImage);

    let processedOut = processedOutRaw;
    if (
      personForTryOn &&
      garmentImageUrl &&
      processedOut &&
      !isValidFinalTryOnImage(processedOut, personForTryOn, garmentImageUrl, { requireTryOnHeuristic: false })
    ) {
      processedOut = normalizeProcessedUrl(
        req,
        await resolveExhibitionFinalImage(null, personForTryOn, garmentImageUrl)
      );
    }

    const payload = {
      clothId: resolved.clothId,
      originalImage: originalOut,
      processedImage: processedOut,
      status: normalizeClientTryOnStatus(inference.status),
    };
    if (isTryOnFlowDebug()) {
      console.info("[try-on flow] http response body (POST /api/tryon)", {
        clothId: payload.clothId,
        status: payload.status,
        originalImage: summarizeTryOnImageField("originalImage", payload.originalImage),
        processedImage: summarizeTryOnImageField("processedImage", payload.processedImage),
      });
    }
    return res.status(200).json(payload);
  } catch (err) {
    console.error("tryon error:", err);
    if (err instanceof ReplicateTryOnError && err.code === "MISSING_HF_TOKEN") {
      return res.status(503).json({ message: err.message });
    }
    if (err.name === "AbortError") {
      return res.status(504).json({ message: "AI try-on service timed out" });
    }
    const msg = err?.message || "";
    if (err instanceof ReplicateTryOnError || /replicate try-on/i.test(msg)) {
      return res.status(502).json({ message: msg || "Replicate try-on failed" });
    }
    if (msg.includes("AI try-on service")) {
      return res.status(502).json({ message: msg });
    }
    return res.status(500).json({ message: "Server error" });
  }
};

const tryOnStatus = async (req, res) => {
  const predictionId = String(req.params.predictionId || "").trim();
  if (!predictionId) {
    return res.status(400).json({ message: "predictionId is required" });
  }
  try {
    const startedAtRaw = Number(req.query.startedAt);
    const startedAt = Number.isFinite(startedAtRaw) && startedAtRaw > 0 ? startedAtRaw : Date.now();
    const state = await getTryOnPredictionState(predictionId, { startedAt });

    if (state.status === "succeeded") {
      return res.status(200).json({
        predictionId,
        status: "succeeded",
        processedImage: normalizeProcessedUrl(req, state.output),
        elapsedMs: state.elapsedMs,
        createdAt: state.createdAt,
      });
    }
    if (state.status === "starting" || state.status === "processing") {
      return res.status(200).json({
        predictionId,
        status: state.status,
        elapsedMs: state.elapsedMs,
        createdAt: state.createdAt,
      });
    }
    if (state.status === "failed" || state.status === "canceled") {
      return res.status(200).json({
        predictionId,
        status: state.status === "canceled" ? "failed" : state.status,
        elapsedMs: state.elapsedMs,
        createdAt: state.createdAt,
        error: state.error || "Replicate try-on failed",
      });
    }
    return res.status(502).json({
      predictionId,
      message: "Unexpected try-on status returned by Replicate",
    });
  } catch (err) {
    const msg = err?.message || "";
    if (err instanceof ReplicateTryOnError || /prediction failed/i.test(msg)) {
      return res.status(502).json({ message: msg || "Replicate try-on failed" });
    }
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { tryOn, tryOnStatus };
