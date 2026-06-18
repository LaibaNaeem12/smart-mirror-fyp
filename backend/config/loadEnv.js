const path = require("path");
const dotenv = require("dotenv");

/** Absolute path to the single backend env file (never cwd-relative). */
const BACKEND_ENV_PATH = path.resolve(__dirname, "..", ".env");

/**
 * Load `backend/.env` into `process.env` regardless of process cwd.
 * Other entrypoints (scripts) should call this before reading env.
 */
function loadEnv() {
  const result = dotenv.config({ path: BACKEND_ENV_PATH });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.warn(`[env] No .env file at ${BACKEND_ENV_PATH} — using process env only`);
    } else {
      console.warn(`[env] Failed to read ${BACKEND_ENV_PATH}: ${result.error.message}`);
    }
  } else {
    console.log(`[env] Loaded ${BACKEND_ENV_PATH}`);
  }
  return BACKEND_ENV_PATH;
}

module.exports = { loadEnv, BACKEND_ENV_PATH };
