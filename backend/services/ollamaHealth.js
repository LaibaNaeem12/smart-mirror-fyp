/**
 * Lightweight startup probe for Ollama (does not load models).
 */

async function probeOllama(baseUrl, probeTimeoutMs = 3500) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) {
    return { ok: false, reason: "OLLAMA_BASE_URL must be http(s)" };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), probeTimeoutMs);
  try {
    const res = await fetch(`${base}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    if (e && e.name === "AbortError") {
      return { ok: false, reason: `probe timed out after ${probeTimeoutMs}ms` };
    }
    const code = e && (e.cause?.code || e.code);
    if (code === "ECONNREFUSED") {
      return { ok: false, reason: "ECONNREFUSED (Ollama not listening on this host/port)" };
    }
    const msg = e && typeof e.message === "string" ? e.message : String(e);
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { probeOllama };
