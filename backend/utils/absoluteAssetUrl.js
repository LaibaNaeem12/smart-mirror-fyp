/**
 * Build an absolute URL for a path served by this API (/dataset, /images).
 * Handles DB values with or without a leading slash; leaves http(s) URLs unchanged.
 */
function absoluteAssetUrl(req, storedPath) {
  if (storedPath == null) return storedPath;
  const s = String(storedPath).trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;

  const rel = s.startsWith("/") ? s : `/${s}`;
  const parts = rel.split("/").filter(Boolean);
  const encodedPath = "/" + parts.map((seg) => encodeURIComponent(seg)).join("/");

  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}${encodedPath}`;
}

module.exports = { absoluteAssetUrl };
