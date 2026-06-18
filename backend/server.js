const path = require("path");
const { loadEnv } = require("./config/loadEnv");
const { readConfig, logStartupConfig } = require("./config/env");

loadEnv();
const config = readConfig();
logStartupConfig(config);

const express = require("express");
const fs = require("fs");
const cors = require("cors");
const mongoose = require("mongoose");

const tryonRoutes = require("./routes/tryonRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const aiRoutes = require("./routes/aiRoutes");
const { absoluteAssetUrl } = require("./utils/absoluteAssetUrl");
const { setDbConnected, setMockCatalog } = require("./dbState");
const { probeOllama } = require("./services/ollamaHealth");
const { readOllamaGenerateOptions } = require("./services/ollamaService");

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const LEGACY_DATASET_PATH = path.resolve(__dirname, "../dataset");
const INVENTORY_DATASET_PATH = path.join(__dirname, "../frontend/public/dataset");

if (fs.existsSync(LEGACY_DATASET_PATH)) {
  app.use("/images", express.static(LEGACY_DATASET_PATH, { fallthrough: true }));
} else {
  console.log("[static] legacy /images dataset not present (optional)");
}

app.use("/dataset", express.static(INVENTORY_DATASET_PATH, { fallthrough: true }));

if (!fs.existsSync(INVENTORY_DATASET_PATH)) {
  console.log("[static] inventory /dataset folder not found:", INVENTORY_DATASET_PATH);
}

// Legacy: nested gender/category → arrays of absolute image URLs (same encoding as catalog).
app.get("/api/clothes", (req, res) => {
  const result = {};
  const genders = ["men", "women"];

  genders.forEach((gender) => {
    const genderPath = path.join(LEGACY_DATASET_PATH, gender);
    result[gender] = {};

    if (!fs.existsSync(genderPath)) return;

    const categories = fs
      .readdirSync(genderPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    categories.forEach((category) => {
      const categoryPath = path.join(genderPath, category);
      const images = fs
        .readdirSync(categoryPath, { withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => f.name);

      result[gender][category] = images.map((name) =>
        absoluteAssetUrl(req, `/images/${gender}/${category}/${name}`)
      );
    });
  });

  res.json(result);
});

app.use("/api/debug", require("./routes/replicateDebugRoutes"));
app.use("/api/replicate", require("./routes/replicateHealthRoutes"));
app.use("/api/catalog", catalogRoutes);
app.use("/api/tryon", tryonRoutes);
app.use("/api/ai", aiRoutes);

let httpStarted = false;
function startHttpServer() {
  if (httpStarted) return;
  httpStarted = true;
  app.listen(config.PORT, () => {
    console.log(`[http] Server listening on port ${config.PORT}`);
    console.log(`[ollama] model = ${config.OLLAMA_MODEL}`);
    probeOllama(config.OLLAMA_BASE_URL).then((r) => {
      if (r.ok) {
        console.log(`[ollama] Reachable at ${config.OLLAMA_BASE_URL}`);
        try {
          console.log("[ollama] generate options (RAM-related):", readOllamaGenerateOptions());
        } catch (_) {
          /* ignore */
        }
      } else {
        console.warn(
          `[ollama] Not reachable: ${r.reason} — stylist route will return a safe fallback when Ollama errors`
        );
      }
    });
  });
}

function applyMongoDisconnectedState(reasonTag) {
  setDbConnected(false);
  const useMock =
    reasonTag === "no_uri" ||
    reasonTag === "invalid_uri" ||
    config.USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE;
  setMockCatalog(useMock);
  if (reasonTag === "no_uri") {
    console.log(
      "[mongo] No MONGO_URI — running without database (embedded demo catalog for /api/catalog)"
    );
  } else if (reasonTag === "invalid_uri") {
    console.log(
      "[mongo] Invalid MONGO_URI format — skipping connect (embedded demo catalog for /api/catalog)"
    );
  } else if (reasonTag === "connect_failed") {
    if (config.USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE) {
      console.warn(
        "[mongo] Using embedded demo catalog because USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE=true"
      );
    } else {
      console.warn(
        "[mongo] Database unavailable — /api/catalog returns empty lists until MongoDB is reachable (set USE_MOCK_CATALOG_WHEN_DB_UNAVAILABLE=true to re-enable demo catalog)"
      );
    }
  }
}

if (config.MONGO_URI_WAS_INVALID) {
  applyMongoDisconnectedState("invalid_uri");
  startHttpServer();
} else if (!config.MONGO_URI) {
  applyMongoDisconnectedState("no_uri");
  startHttpServer();
} else {
  console.log("[mongo] Connecting…");
  mongoose
    .connect(config.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    })
    .then(() => {
      setDbConnected(true);
      setMockCatalog(false);
      console.log("[mongo] Connected");
      startHttpServer();
    })
    .catch((err) => {
      console.error("[mongo] Connection failed");
      console.error(err && err.stack ? err.stack : err);
      if (err?.name === "MongooseServerSelectionError") {
        console.error(
          "[mongo] Hint: Atlas IP allowlist, wrong password, VPN/DNS, or cluster paused (URI not logged)."
        );
      }
      applyMongoDisconnectedState("connect_failed");
      startHttpServer();
    });
}
