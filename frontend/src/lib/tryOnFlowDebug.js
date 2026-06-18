/**
 * Opt-in verbose logging for the try-on HTTP + UI pipeline.
 * Set VITE_TRY_ON_FLOW_DEBUG=true in frontend/.env (requires dev server restart).
 */

export function isTryOnFlowDebug() {
  return import.meta.env.VITE_TRY_ON_FLOW_DEBUG === "true";
}

/**
 * @param {string} [label]
 * @param {unknown} value
 */
export function summarizeTryOnImageField(label, value) {
  const name = label || "image";
  if (value == null || value === "") {
    return { field: name, absent: true };
  }
  const s = String(value);
  const data = /^data:image\//i.test(s);
  const http = /^https?:\/\//i.test(s);
  const kind = data ? "data_url" : http ? "https" : "relative_or_other";
  return {
    field: name,
    kind,
    length: s.length,
    prefix: s.slice(0, 96),
  };
}
