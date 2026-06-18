/**
 * Optional local ComfyUI backup for exhibition try-on (L2 in fallback chain).
 *
 * Preferred integration (stable across workflow JSON churn):
 *   COMFY_TRYON_BRIDGE_URL — POST JSON { personImage, clothImage } → JSON { processedImage | image | output }
 *
 * Direct ComfyUI (http://127.0.0.1:8188) queue is workflow-specific; enable only when you wire a workflow:
 *   COMFYUI_TRYON_DIRECT — set "true" to attempt POST /prompt using COMFYUI_TRYON_WORKFLOW_FILE (absolute path to API-format JSON).
 *
 * Env:
 *   ENABLE_COMFYUI — must be "1" / "true" / "yes" or Comfy is never called (code kept; returns null).
 *   COMFYUI_BASE_URL — default http://127.0.0.1:8188
 *   COMFY_TRYON_TIMEOUT_MS — default 120000
 */

const fs = require("fs");

const DEFAULT_BASE = "http://127.0.0.1:8188";
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * @returns {boolean}
 */
function isComfyExecutionEnabled() {
  const v = String(process.env.ENABLE_COMFYUI || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @returns {boolean}
 */
function isComfyTryOnConfigured() {
  if (!isComfyExecutionEnabled()) return false;
  const bridge = String(process.env.COMFY_TRYON_BRIDGE_URL || "").trim();
  if (bridge) return true;
  const direct = String(process.env.COMFYUI_TRYON_DIRECT || "").trim().toLowerCase();
  if (direct === "1" || direct === "true" || direct === "yes") {
    const wf = String(process.env.COMFYUI_TRYON_WORKFLOW_FILE || "").trim();
    return wf.length > 0;
  }
  return false;
}

/**
 * @param {string} base
 * @returns {Promise<boolean>}
 */
async function comfyServerReachable(base) {
  const b = String(base || DEFAULT_BASE).replace(/\/$/, "");
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 2500);
  try {
    const res = await fetch(`${b}/system_stats`, { method: "GET", signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Minimal ComfyUI /prompt + /history/{id} poll (only when COMFYUI_TRYON_DIRECT + workflow file).
 * @param {string} personImage
 * @param {string} clothImage
 * @param {string} base
 * @param {number} timeoutMs
 * @returns {Promise<string | null>}
 */
async function runComfyDirectQueue(personImage, clothImage, base, timeoutMs) {
  const wfPath = String(process.env.COMFYUI_TRYON_WORKFLOW_FILE || "").trim();
  if (!wfPath || !fs.existsSync(wfPath)) {
    console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=missing_workflow_file");
    return null;
  }
  let raw = fs.readFileSync(wfPath, "utf8");
  raw = raw.replace(/__PERSON_IMAGE__/g, JSON.stringify(personImage));
  raw = raw.replace(/__CLOTH_IMAGE__/g, JSON.stringify(clothImage));
  /** @type {Record<string, unknown>} */
  let workflow;
  try {
    workflow = JSON.parse(raw);
  } catch (e) {
    console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=invalid_workflow_json");
    return null;
  }

  const clientId = `tryon-${Date.now()}`;
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const pr = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: ac.signal,
    });
    if (!pr.ok) {
      const txt = await pr.text().catch(() => "");
      console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", `reason=prompt_http_${pr.status}`);
      console.warn("[COMFYUI] /prompt error", txt.slice(0, 200));
      return null;
    }
    const body = await pr.json();
    const promptId = body?.prompt_id != null ? String(body.prompt_id) : "";
    if (!promptId) {
      console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=no_prompt_id");
      return null;
    }

    const poll0 = Date.now();
    while (Date.now() - poll0 < timeoutMs) {
      await new Promise((r) => setTimeout(r, 800));
      const hr = await fetch(`${base}/history/${encodeURIComponent(promptId)}`, {
        method: "GET",
        signal: ac.signal,
      });
      if (!hr.ok) continue;
      const hist = await hr.json();
      const entry = hist?.[promptId];
      const status = entry?.status?.status_str;
      if (status === "error") {
        console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=queue_error");
        return null;
      }
      if (status === "success" && entry?.outputs) {
        const outs = entry.outputs;
        for (const nodeId of Object.keys(outs)) {
          const images = outs[nodeId]?.images;
          if (Array.isArray(images) && images[0]?.filename) {
            const fn = images[0].filename;
            const sub = images[0].subfolder || "";
            const type = images[0].type || "output";
            const params = new URLSearchParams({ filename: fn, type, subfolder: sub });
            return `${base}/view?${params.toString()}`;
          }
        }
      }
    }
    console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=queue_timeout");
    return null;
  } catch (e) {
    console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", `reason=${String(e?.message || e).slice(0, 60)}`);
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * @param {string} personImage
 * @param {string} clothImage
 * @returns {Promise<string | null>}
 */
async function runComfyTryOn(personImage, clothImage) {
  if (!isComfyExecutionEnabled()) return null;

  const timeoutMs = Number(process.env.COMFY_TRYON_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const base = String(process.env.COMFYUI_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

  const bridge = String(process.env.COMFY_TRYON_BRIDGE_URL || "").trim();
  if (bridge) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(bridge, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personImage, clothImage }),
        signal: ac.signal,
      });
      if (!res.ok) {
        console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", `reason=bridge_http_${res.status}`);
        return null;
      }
      const data = await res.json();
      const out =
        (typeof data?.processedImage === "string" && data.processedImage) ||
        (typeof data?.image === "string" && data.image) ||
        (typeof data?.output === "string" && data.output) ||
        null;
      if (out && String(out).trim()) return String(out).trim();
      console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=bridge_empty_body");
      return null;
    } catch (e) {
      console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", `reason=${String(e?.message || e).slice(0, 80)}`);
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  const direct = String(process.env.COMFYUI_TRYON_DIRECT || "").trim().toLowerCase();
  if (direct === "1" || direct === "true" || direct === "yes") {
    const ok = await comfyServerReachable(base);
    if (!ok) {
      console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=server_unreachable");
      return null;
    }
    return runComfyDirectQueue(personImage, clothImage, base, timeoutMs);
  }

  console.log("[FALLBACK FLOW]", "step=comfyui", "status=failed", "reason=not_configured");
  return null;
}

module.exports = {
  runComfyTryOn,
  isComfyTryOnConfigured,
  isComfyExecutionEnabled,
  comfyServerReachable,
};
