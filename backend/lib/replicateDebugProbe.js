/**
 * Dev-only Replicate connectivity check (does not touch try-on or existing services).
 * Uses the tiny public `replicate/hello-world` model.
 */

const Replicate = require("replicate");

/** Pinned version — Replicate no longer accepts unversioned `model` for this endpoint (404). */
const DEBUG_MODEL_DEFAULT =
  "replicate/hello-world:9dcd6d78e7c6560c340d916fe32e9f24aabfa331e5cce95fe31f77fb03121426";

function resolveDebugModel() {
  const fromEnv = String(process.env.REPLICATE_DEBUG_MODEL || "").trim();
  return fromEnv || DEBUG_MODEL_DEFAULT;
}

function tokenPreviewFromEnv() {
  const t = String(process.env.REPLICATE_API_TOKEN || "").trim();
  if (!t) {
    return { configured: false, preview: null, length: 0 };
  }
  const preview =
    t.length <= 14 ? `(${t.length} chars)` : `${t.slice(0, 8)}…${t.slice(-4)} (${t.length} chars)`;
  return { configured: true, preview, length: t.length };
}

function serializeOutput(output) {
  if (output == null) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    return output.map((o) => {
      if (o != null && typeof o === "object" && typeof o.url === "function") {
        try {
          return o.url();
        } catch {
          return String(o);
        }
      }
      return String(o);
    });
  }
  if (typeof output === "object" && typeof output.url === "function") {
    try {
      return output.url();
    } catch {
      return String(output);
    }
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

/**
 * Runs one `replicate.run` against hello-world. Safe to call from HTTP or CLI.
 * @returns {Promise<{ ok: boolean, model: string, token: ReturnType<typeof tokenPreviewFromEnv>, output: unknown, error: object | null }>}
 */
async function runReplicateConnectivityProbe() {
  const tokenMeta = tokenPreviewFromEnv();
  const token = (process.env.REPLICATE_API_TOKEN || "").trim();
  const debugModel = resolveDebugModel();

  if (!token) {
    return {
      ok: false,
      model: debugModel,
      token: tokenMeta,
      output: null,
      error: { message: "REPLICATE_API_TOKEN is not set in environment (check backend/.env)" },
    };
  }

  const replicate = new Replicate({ auth: token });
  try {
    const output = await replicate.run(debugModel, {
      input: { text: "smart-mirror connectivity probe" },
    });
    return {
      ok: true,
      model: debugModel,
      token: tokenMeta,
      output: serializeOutput(output),
      error: null,
    };
  } catch (err) {
    const error = {
      name: err?.name,
      message: err?.message,
      status: err?.status,
      stack: err?.stack,
    };
    return {
      ok: false,
      model: debugModel,
      token: tokenMeta,
      output: null,
      error,
    };
  }
}

module.exports = {
  runReplicateConnectivityProbe,
  tokenPreviewFromEnv,
  DEBUG_MODEL_DEFAULT,
  resolveDebugModel,
};
