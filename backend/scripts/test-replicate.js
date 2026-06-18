#!/usr/bin/env node
/**
 * CLI: verify Replicate token + API with a tiny model (replicate/hello-world).
 * Usage (from backend/): npm run test:replicate
 * Or: node scripts/test-replicate.js
 */

const { loadEnv } = require("../config/loadEnv");
const { runReplicateConnectivityProbe } = require("../lib/replicateDebugProbe");

loadEnv();

console.log("[test-replicate] cwd=%s", process.cwd());
console.log("[test-replicate] loading env via config/loadEnv (backend/.env)");

(async () => {
  const result = await runReplicateConnectivityProbe();
  console.log("[test-replicate] full result:\n%s", JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})().catch((e) => {
  console.error("[test-replicate] fatal", e);
  process.exit(1);
});
