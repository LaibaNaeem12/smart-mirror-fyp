/**
 * Optional Replicate API connectivity probe (debug only).
 * Enable with REPLICATE_DEBUG_ROUTE=true in backend/.env — disabled by default.
 */

const express = require("express");
const { runReplicateConnectivityProbe } = require("../lib/replicateDebugProbe");

const router = express.Router();

router.get("/replicate", async (req, res) => {
  const enabled = String(process.env.REPLICATE_DEBUG_ROUTE || "")
    .trim()
    .toLowerCase();
  if (enabled !== "true" && enabled !== "1" && enabled !== "yes") {
    return res.status(404).json({
      ok: false,
      message:
        "Replicate debug route is disabled. Set REPLICATE_DEBUG_ROUTE=true in backend/.env, restart the server, then GET /api/debug/replicate",
    });
  }

  const result = await runReplicateConnectivityProbe();

  if (result.ok) {
    console.log("[replicate-debug] GET /api/debug/replicate OK", JSON.stringify(result, null, 2));
  } else {
    console.error("[replicate-debug] GET /api/debug/replicate FAILED", JSON.stringify(result, null, 2));
  }

  const status = result.ok ? 200 : 502;
  return res.status(status).json(result);
});

module.exports = router;
