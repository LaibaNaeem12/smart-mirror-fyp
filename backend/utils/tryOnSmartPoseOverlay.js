/**
 * Exhibition fallback L2: MoveNet single-pose (via @tensorflow-models/pose-detection, CPU backend)
 * for shoulder/torso/hip–aligned garment placement + Sharp composite.
 * L3: simple torso composite (createDemoComposite).
 *
 * Note: MoveNet exposes COCO-style landmarks comparable to MediaPipe pose use-cases for try-on alignment.
 *
 * Env:
 *   TRY_ON_SMART_POSE_OVERLAY — default "true"; set "false" to skip pose and use L3 only.
 *   TRY_ON_POSE_MAX_SIDE — max side (px) for pose input (default 448, smaller = faster).
 *   TRY_ON_POSE_MIN_SCORE — overall pose score threshold (default 0.22).
 *   MOVE_NET_MODEL_URL — optional custom model URL/dir for fully-offline booths (see TF Hub docs).
 */

if (process.env.TF_CPP_MIN_LOG_LEVEL == null || String(process.env.TF_CPP_MIN_LOG_LEVEL).trim() === "") {
  process.env.TF_CPP_MIN_LOG_LEVEL = "3";
}

const sharp = require("sharp");
const { createDemoComposite, tryBufferFromImageRef } = require("./tryOnDemoComposite");

function isSmartPoseOverlayEnabled() {
  const v = String(process.env.TRY_ON_SMART_POSE_OVERLAY ?? "true")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

function tryLoadPoseLibs() {
  try {
    return {
      tf: require("@tensorflow/tfjs"),
      poseDetection: require("@tensorflow-models/pose-detection"),
    };
  } catch {
    return null;
  }
}

function isTryOnFlowDebug() {
  return String(process.env.TRY_ON_FLOW_DEBUG || "").trim() === "true";
}

/** @type {Promise<import("@tensorflow-models/pose-detection").PoseDetector | null> | null} */
let detectorLoadPromise = null;

async function getPoseDetector() {
  if (!isSmartPoseOverlayEnabled()) return null;
  if (!tryLoadPoseLibs()) {
    console.log("[TRYON] pose_detection_libs_missing");
    return null;
  }
  if (!detectorLoadPromise) {
    detectorLoadPromise = (async () => {
      const restoreWarn = console.warn;
      try {
        const libs = tryLoadPoseLibs();
        if (!libs) return null;
        const { tf, poseDetection } = libs;
        console.warn = (...args) => {
          const m = String(args[0] ?? "");
          if (/tensorflow|tfjs|backend registered|platform/i.test(m)) return;
          restoreWarn.apply(console, args);
        };
        await tf.setBackend("cpu");
        await tf.ready();
        const modelUrl = (process.env.MOVE_NET_MODEL_URL || "").trim() || undefined;
        return await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          modelUrl,
        });
      } catch (e) {
        console.log("[TRYON] pose_detector_init_failed", String(e?.message || e).slice(0, 120));
        return null;
      } finally {
        console.warn = restoreWarn;
      }
    })();
  }
  return detectorLoadPromise;
}

/**
 * @param {string} personRef
 * @param {string} clothRef
 * @returns {Promise<string | null>} data:image/png;base64,... or null → use L3
 */
async function createSmartPoseOverlay(personRef, clothRef) {
  if (!isSmartPoseOverlayEnabled()) return null;

  const libs = tryLoadPoseLibs();
  if (!libs) return null;

  const { tf } = libs;

  const detector = await getPoseDetector();
  if (!detector) return null;

  const personBuf = await tryBufferFromImageRef(personRef);
  const clothBuf = await tryBufferFromImageRef(clothRef);
  if (!personBuf || !personBuf.length || !clothBuf || !clothBuf.length) return null;

  let base = sharp(personBuf).rotate();
  const maxW = 1024;
  const m0 = await base.metadata();
  if ((m0.width || 0) > maxW) {
    base = base.resize({ width: maxW });
  }
  const meta = await base.metadata();
  const fullW = meta.width || 768;
  const fullH = meta.height || 1024;

  const poseMax = Math.min(640, Math.max(192, Number(process.env.TRY_ON_POSE_MAX_SIDE || 448) || 448));
  const poseRgb = await base
    .clone()
    .resize({ width: poseMax, height: poseMax, fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = poseRgb;
  const pw = info.width;
  const ph = info.height;
  const pixCh = info.channels || 3;
  const flat = new Uint8Array(pw * ph * 3);
  for (let i = 0, o = 0; i < data.length; i += pixCh, o += 3) {
    flat[o] = data[i];
    flat[o + 1] = data[i + 1];
    flat[o + 2] = data[i + 2];
  }

  const scaleX = fullW / pw;
  const scaleY = fullH / ph;

  const input = tf.tensor3d(flat, [ph, pw, 3], "int32");
  let poses;
  try {
    poses = await detector.estimatePoses(input, { flipHorizontal: false });
  } finally {
    input.dispose();
  }

  const minScore = Math.min(0.9, Math.max(0.08, Number(process.env.TRY_ON_POSE_MIN_SCORE || 0.22) || 0.22));
  const pose = poses && poses[0];
  if (!pose || (pose.score != null && pose.score < minScore)) {
    return null;
  }

  const kp = pose.keypoints || [];
  const byName = (n) => kp.find((k) => k.name === n);
  const ls = byName("left_shoulder");
  const rs = byName("right_shoulder");
  const lh = byName("left_hip");
  const rh = byName("right_hip");
  if (!ls || !rs || (ls.score != null && ls.score < 0.2) || (rs.score != null && rs.score < 0.2)) {
    return null;
  }

  const lsF = { x: ls.x * scaleX, y: ls.y * scaleY };
  const rsF = { x: rs.x * scaleX, y: rs.y * scaleY };
  const lhF = lh ? { x: lh.x * scaleX, y: lh.y * scaleY } : null;
  const rhF = rh ? { x: rh.x * scaleX, y: rh.y * scaleY } : null;

  const shoulderMid = { x: (lsF.x + rsF.x) / 2, y: (lsF.y + rsF.y) / 2 };
  const hipMid =
    lhF && rhF
      ? { x: (lhF.x + rhF.x) / 2, y: (lhF.y + rhF.y) / 2 }
      : { x: shoulderMid.x, y: shoulderMid.y + fullH * 0.35 };
  const torsoCenter = { x: (shoulderMid.x + hipMid.x) / 2, y: (shoulderMid.y + hipMid.y) / 2 };

  const dx = rsF.x - lsF.x;
  const dy = rsF.y - lsF.y;
  const shoulderWidth = Math.hypot(dx, dy);
  if (shoulderWidth < fullW * 0.06) {
    return null;
  }

  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const garmentTargetW = Math.min(fullW * 0.95, Math.max(fullW * 0.28, shoulderWidth * 1.55));

  let clothPng = await sharp(clothBuf)
    .rotate()
    .resize({
      width: Math.round(garmentTargetW),
      height: Math.round(fullH * 0.55),
      fit: "contain",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  clothPng = await sharp(clothPng)
    .rotate(angleDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const cm = await sharp(clothPng).metadata();
  const cw = cm.width || 1;
  const ch = cm.height || 1;

  const left = Math.round(Math.max(0, Math.min(fullW - cw, torsoCenter.x - cw / 2)));
  const top = Math.round(Math.max(0, Math.min(fullH - ch, torsoCenter.y - ch * 0.42)));

  const outBuf = await base
    .ensureAlpha()
    .composite([
      {
        input: clothPng,
        left,
        top,
        blend: "multiply",
        opacity: 0.58,
      },
    ])
    .png()
    .toBuffer();

  return `data:image/png;base64,${outBuf.toString("base64")}`;
}

/**
 * L2 pose-aware overlay, then L3 simple Sharp composite.
 * @param {string} personRef
 * @param {string} clothRef
 */
async function createExhibitionFallbackImage(personRef, clothRef) {
  if (!isSmartPoseOverlayEnabled()) {
    return createDemoComposite(personRef, clothRef);
  }

  try {
    const smart = await createSmartPoseOverlay(personRef, clothRef);
    if (smart) {
      return smart;
    }
  } catch (e) {
    if (isTryOnFlowDebug()) console.warn("[TRYON] pose_overlay_error", e?.message || e);
  }
  return createDemoComposite(personRef, clothRef);
}

module.exports = {
  createSmartPoseOverlay,
  createExhibitionFallbackImage,
  isSmartPoseOverlayEnabled,
};
