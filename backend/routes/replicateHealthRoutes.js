const express = require("express");
const { runReplicateConnectivityProbe } = require("../lib/replicateDebugProbe");

const router = express.Router();

/**
 * GET /api/replicate/health-test
 * Minimal Replicate prediction (hello-world) + full lifecycle logging.
 */
router.get("/health-test", async (req, res) => {
  const t0 = Date.now();
  try {
    const probe = await runReplicateConnectivityProbe();
    const latencyMs = Date.now() - t0;
    console.info("[TRYON HEALTH] GET /api/replicate/health-test", { latencyMs, probe });
    const ok = probe.ok === true;
    return res.status(ok ? 200 : 502).json({ ok, latencyMs, probe });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[TRYON HEALTH] GET /api/replicate/health-test failed", { latencyMs, message });
    return res.status(500).json({ ok: false, latencyMs, error: message });
  }
});

module.exports = router;
