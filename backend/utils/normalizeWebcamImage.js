/**
 * Normalize client webcam payload for JSON try-on requests.
 * Accepts a data URL (data:image/...;base64,...) or raw base64 (assumed JPEG).
 *
 * @param {unknown} raw
 * @returns {string | null} data URL or null if absent / invalid
 */
const MAX_CHARS = 14_000_000; // ~10.5MB binary as base64 — stays under typical body limits

function normalizeWebcamImage(raw) {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.length > MAX_CHARS) return null;

  if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s)) {
    const b64 = s.split(",")[1];
    if (!b64 || !isReasonableBase64(b64)) return null;
    return s;
  }

  if (/^[a-z0-9+/=\s]+$/i.test(s) && s.length > 100) {
    const compact = s.replace(/\s+/g, "");
    if (!isReasonableBase64(compact)) return null;
    return `data:image/jpeg;base64,${compact}`;
  }

  return null;
}

function isReasonableBase64(b64) {
  if (b64.length < 100) return false;
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 32) return false;
    if (buf.length > 12 * 1024 * 1024) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = { normalizeWebcamImage };
