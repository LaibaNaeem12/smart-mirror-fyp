/**
 * Validated backend configuration (after `loadEnv()` has run).
 */

function parsePort(raw) {
  if (raw == null || String(raw).trim() === "") return 5000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.warn("[env] Invalid PORT — using 5000");
    return 5000;
  }
  return n;
}

function trimMongoUri() {
  const v = process.env.MONGO_URI;
  if (v == null) return "";
  return String(v).trim();
}

function validateMongoUri(uri) {
  if (!uri) return { ok: true };
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    return {
      ok: false,
      error: "MONGO_URI must start with mongodb:// or mongodb+srv://",
    };
  }
  return { ok: true };
}

function parsePositiveInt(raw, fallback, label, max = 600_000) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    if (raw != null && String(raw).trim() !== "") {
      console.warn(`[env] Invalid ${label} — using ${fallback}`);
    }
    return fallback;
  }
  return Math.min(Math.floor(n), max);
}

function maskMongoUri(uri) {
  if (!uri) return "(not set)";
  const s = String(uri);
  return s.replace(/\/\/([^:@/]+):([^@]+)@/g, "//$1:***@");
}

function readConfig() {
  const MONGO_URI_RAW = trimMongoUri();
  const mongoCheck = validateMongoUri(MONGO_URI_RAW);
  const MONGO_URI = mongoCheck.ok ? MONGO_URI_RAW : "";

  if (!mongoCheck.ok) {
    console.error(`[env] ${mongoCheck.error}`);
  }

  const USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE =
    String(process.env.USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE || "")
      .trim()
      .toLowerCase() === "true";

  const OLLAMA_BASE_URL = String(
    process.env.OLLAMA_BASE_URL || "http://localhost:11434"
  ).replace(/\/$/, "");
  const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "llama3.2").trim() || "llama3.2";
  const OLLAMA_TIMEOUT_MS = parsePositiveInt(
    process.env.OLLAMA_TIMEOUT_MS,
    120_000,
    "OLLAMA_TIMEOUT_MS"
  );

  return {
    PORT: parsePort(process.env.PORT),
    MONGO_URI,
    MONGO_URI_WAS_INVALID: !mongoCheck.ok && !!MONGO_URI_RAW,
    mongoUriMasked: maskMongoUri(MONGO_URI_RAW),
    USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_TIMEOUT_MS,
  };
}

function logStartupConfig(cfg) {
  console.log("[env] PORT=", cfg.PORT);
  console.log("[env] MONGO_URI=", cfg.mongoUriMasked || "(not set)");
  console.log(
    "[env] USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE=",
    cfg.USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE
  );
  console.log("[env] OLLAMA_BASE_URL=", cfg.OLLAMA_BASE_URL);
  console.log("[env] OLLAMA_MODEL=", cfg.OLLAMA_MODEL);
  console.log("[env] OLLAMA_TIMEOUT_MS=", cfg.OLLAMA_TIMEOUT_MS);
}

module.exports = {
  readConfig,
  logStartupConfig,
  maskMongoUri,
  validateMongoUri,
};
