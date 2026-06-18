/**
 * Exhibition-safe demo composite when Replicate output is missing, invalid, or clearly not a try-on.
 *
 * Env:
 *   TRY_ON_EXHIBITION_COMPOSITE_FALLBACK — default "true"; set "false" to disable and use strict normalize-only behavior.
 */

const sharp = require("sharp");

/** @type {string | null} */
let exhibitionPlaceholderDataUrl = null;

/**
 * Tiny neutral PNG when all composites fail but an image ref is still required (never raw person/garment).
 * @returns {Promise<string>}
 */
async function getTryOnExhibitionPlaceholderDataUrl() {
  if (exhibitionPlaceholderDataUrl) return exhibitionPlaceholderDataUrl;
  const outBuf = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 36, g: 36, b: 44 } },
  })
    .png()
    .toBuffer();
  exhibitionPlaceholderDataUrl = `data:image/png;base64,${outBuf.toString("base64")}`;
  return exhibitionPlaceholderDataUrl;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function urlsEquivalent(a, b) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x || !y) return false;
  if (x === y) return true;
  try {
    if (/^https?:\/\//i.test(x) && /^https?:\/\//i.test(y)) {
      const ux = new URL(x);
      const uy = new URL(y);
      return ux.origin === uy.origin && ux.pathname === uy.pathname;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Heuristic: usable final image URL that is not obviously the raw garment or unchanged webcam frame.
 * @param {unknown} image
 * @param {string} [inputClothImage]
 * @param {string} [inputPersonImage]
 * @returns {boolean}
 */
function looksLikePersonWearingCloth(image, inputClothImage, inputPersonImage) {
  if (!image || typeof image !== "string") return false;
  const s = image.trim();
  if (!/^https?:\/\//i.test(s) && !/^data:image\//i.test(s)) return false;
  if (inputClothImage && urlsEquivalent(s, inputClothImage)) return false;
  if (inputPersonImage && urlsEquivalent(s, inputPersonImage)) return false;
  return true;
}

function isExhibitionFallbackEnabled() {
  const v = String(process.env.TRY_ON_EXHIBITION_COMPOSITE_FALLBACK ?? "true")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

/**
 * @param {string} ref
 * @returns {Promise<Buffer | null>}
 */
async function tryBufferFromImageRef(ref) {
  try {
    return await bufferFromImageRef(ref);
  } catch {
    return null;
  }
}

/**
 * @param {string} ref
 * @returns {Promise<Buffer>}
 */
async function bufferFromImageRef(ref) {
  const s = String(ref || "").trim();
  if (!s) throw new Error("empty image ref");
  if (/^data:image\//i.test(s)) {
    const comma = s.indexOf(",");
    if (comma < 0) throw new Error("invalid data URL");
    const meta = s.slice(0, comma);
    const payload = s.slice(comma + 1);
    if (/;base64/i.test(meta)) {
      const buf = Buffer.from(payload, "base64");
      if (!buf.length) throw new Error("empty base64 payload");
      return buf;
    }
    return Buffer.from(decodeURIComponent(payload), "utf8");
  }
  if (/^https?:\/\//i.test(s)) {
    const res = await fetch(s, { redirect: "follow" });
    if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("unsupported image ref (need https URL or data:image)");
}

/**
 * Person background + garment overlay (torso, semi-transparent multiply-style blend).
 * @param {string} inputPersonImage
 * @param {string} inputClothImage
 * @returns {Promise<string>} data:image/png;base64,...
 */
async function createDemoComposite(inputPersonImage, inputClothImage) {
  const personRef = String(inputPersonImage || "").trim();
  const clothRef = String(inputClothImage || "").trim();
  if (!personRef) return "";
  if (!clothRef) {
    return personRef;
  }

  const personBuf = await tryBufferFromImageRef(personRef);
  const clothBuf = await tryBufferFromImageRef(clothRef);

  if (!personBuf || personBuf.length === 0 || !clothBuf || clothBuf.length === 0) {
    return await getTryOnExhibitionPlaceholderDataUrl();
  }

  try {
    const maxW = 1024;
    let base = sharp(personBuf).rotate();
    const meta0 = await base.metadata();
    const w0 = meta0.width || 768;
    if (w0 > maxW) {
      base = base.resize({ width: maxW });
    }
    const { width: bw, height: bh } = await base.metadata();
    const w = bw || 768;
    const h = bh || 1024;

    const garmentW = Math.round(w * 0.44);
    const garmentH = Math.round(h * 0.42);

    const clothPng = await sharp(clothBuf)
      .rotate()
      .resize({
        width: garmentW,
        height: garmentH,
        fit: "contain",
        position: "centre",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    const cm = await sharp(clothPng).metadata();
    const cw = cm.width || garmentW;
    const ch = cm.height || garmentH;
    const left = Math.max(0, Math.round((w - cw) / 2));
    const top = Math.max(0, Math.round(h * 0.22));

    const outBuf = await base
      .ensureAlpha()
      .composite([
        {
          input: clothPng,
          left,
          top,
          blend: "multiply",
          opacity: 0.62,
        },
      ])
      .png()
      .toBuffer();

    return `data:image/png;base64,${outBuf.toString("base64")}`;
  } catch {
    return await getTryOnExhibitionPlaceholderDataUrl();
  }
}

/**
 * Hostnames cloud workers (e.g. Replicate) cannot reach for image fetches.
 * @param {string} hostname
 * @returns {boolean}
 */
function hostnameIsNonPublic(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
  if (h.endsWith(".local")) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

/**
 * Fetch http(s) garment/person URLs that point at this dev machine or LAN and inline as data URLs
 * so Replicate can always read both inputs.
 * @param {string} ref
 * @returns {Promise<string>}
 */
async function inlineNonPublicHttpUrlForExternalApi(ref) {
  const s = String(ref || "").trim();
  if (!s || /^data:image\//i.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) return s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return s;
  }
  if (!hostnameIsNonPublic(u.hostname)) return s;

  try {
    const buf = await bufferFromImageRef(s);
    if (!buf || buf.length === 0) return s;
    const meta = await sharp(buf).metadata();
    const fmt = meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpeg";
    const outBuf =
      fmt === "png"
        ? await sharp(buf).png({ compressionLevel: 6 }).toBuffer()
        : fmt === "webp"
          ? await sharp(buf).webp({ quality: 90 }).toBuffer()
          : await sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return `data:image/${fmt};base64,${outBuf.toString("base64")}`;
  } catch (e) {
    console.warn("[inlineNonPublicHttpUrlForExternalApi] failed, returning original ref", e?.message || e);
    return s;
  }
}

module.exports = {
  looksLikePersonWearingCloth,
  urlsEquivalent,
  createDemoComposite,
  getTryOnExhibitionPlaceholderDataUrl,
  isExhibitionFallbackEnabled,
  bufferFromImageRef,
  tryBufferFromImageRef,
  hostnameIsNonPublic,
  inlineNonPublicHttpUrlForExternalApi,
};
