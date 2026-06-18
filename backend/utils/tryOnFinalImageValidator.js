/**
 * Strict validation for images returned to the client as try-on "processedImage".
 */

const { urlsEquivalent, looksLikePersonWearingCloth } = require("./tryOnDemoComposite");

/**
 * @param {unknown} url
 * @returns {boolean}
 */
function isNonEmptyImageRef(url) {
  if (url == null || typeof url !== "string") return false;
  const t = url.trim();
  if (t.length < 32) return false;
  const low = t.toLowerCase();
  return low.startsWith("http") || low.startsWith("data:image");
}

/**
 * Reject truncated / corrupt base64 payloads (common Sharp "empty buffer" symptom upstream).
 * @param {string} t
 * @returns {boolean}
 */
function hasDecodableBase64Payload(t) {
  const low = t.toLowerCase();
  if (!low.startsWith("data:image/")) return true;
  if (!/;base64,/i.test(t)) return true;
  const comma = t.indexOf(",");
  if (comma < 0) return false;
  const payload = t.slice(comma + 1).trim();
  if (!payload) return false;
  try {
    const buf = Buffer.from(payload, "base64");
    return buf.length >= 64;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} url
 * @param {string} [personImage]
 * @param {string} [garmentImage]
 * @param {{ requireTryOnHeuristic?: boolean }} [opts]
 * @returns {boolean}
 */
function isValidFinalTryOnImage(url, personImage, garmentImage, opts = {}) {
  if (!isNonEmptyImageRef(url)) return false;
  const t = String(url).trim();
  if (!hasDecodableBase64Payload(t)) return false;

  const p = String(personImage || "").trim();
  const g = String(garmentImage || "").trim();

  if (g && urlsEquivalent(t, g)) return false;
  if (p && urlsEquivalent(t, p)) return false;

  if (opts.requireTryOnHeuristic && p && g) {
    if (!looksLikePersonWearingCloth(t, g, p)) return false;
  }

  return true;
}

module.exports = {
  isValidFinalTryOnImage,
  isNonEmptyImageRef,
  hasDecodableBase64Payload,
};
