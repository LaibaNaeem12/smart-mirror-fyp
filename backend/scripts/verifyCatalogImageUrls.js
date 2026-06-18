/**
 * Verifies Cloth.imageUrl paths resolve to files under static roots.
 *
 * Usage:
 *   node scripts/verifyCatalogImageUrls.js
 *   node scripts/verifyCatalogImageUrls.js --http http://127.0.0.1:5000
 *     (API must be running; checks GET /api/catalog/items pages + each imageUrl)
 */
const { loadEnv } = require("../config/loadEnv");
loadEnv();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Cloth = require("../models/Cloth");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BACKEND_ROOT, "..");
const INVENTORY_ROOT = path.join(REPO_ROOT, "frontend", "public", "dataset");
const LEGACY_ROOT = path.join(REPO_ROOT, "dataset");

function resolveImageOnDisk(storedPath) {
  if (storedPath == null || typeof storedPath !== "string") {
    return { abs: null, reason: "missing or non-string path" };
  }
  const s = storedPath.trim();
  if (!s || /^https?:\/\//i.test(s)) {
    return { abs: null, reason: "empty or absolute URL (not checked on disk)" };
  }
  const rel = s.startsWith("/") ? s : `/${s}`;
  if (rel.startsWith("/dataset/")) {
    const sub = rel.slice("/dataset".length); // /men/foo.png
    return {
      abs: path.normalize(path.join(INVENTORY_ROOT, sub)),
      root: INVENTORY_ROOT,
    };
  }
  if (rel.startsWith("/images/")) {
    const sub = rel.slice("/images".length);
    return {
      abs: path.normalize(path.join(LEGACY_ROOT, sub)),
      root: LEGACY_ROOT,
    };
  }
  return { abs: null, reason: `unknown URL prefix (expected /dataset/ or /images/): ${rel}` };
}

function fileExistsSafe(absPath) {
  try {
    return absPath && fs.existsSync(absPath) && fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

async function verifyHttp(apiBase) {
  const base = apiBase.replace(/\/$/, "");
  let offset = 0;
  const limit = 100;
  let total = null;
  let broken = 0;
  let checked = 0;

  while (true) {
    const url = `${base}/api/catalog/items?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error("[verify http] API error", res.status, url);
      process.exitCode = 1;
      return;
    }
    const data = await res.json();
    if (total === null) total = data.total;
    const batch = data.items || [];
    if (!batch.length) break;

    for (const it of batch) {
      checked += 1;
      const img = it.imageUrl;
      if (!img || typeof img !== "string") {
        broken += 1;
        console.warn("[BROKEN http]", it._id, "missing imageUrl");
        continue;
      }
      try {
        let head = await fetch(img, { method: "HEAD", redirect: "follow" });
        if (head.status === 405 || head.status === 501) {
          head = await fetch(img, { method: "GET", redirect: "follow" });
        }
        if (!head.ok) {
          broken += 1;
          console.warn("[BROKEN http]", head.status, img);
        }
      } catch (e) {
        broken += 1;
        console.warn("[BROKEN http]", img, e.message || e);
      }
    }

    offset += batch.length;
    if (offset >= total) break;
  }

  if (broken === 0) {
    console.log("[verify http] All", checked, "catalog image URLs returned OK.");
  } else {
    console.log("[verify http] Broken:", broken, "/", checked);
    process.exitCode = 1;
  }
}

async function main() {
  let httpBase = null;
  const hi = process.argv.findIndex((a) => a === "--http" || a.startsWith("--http="));
  if (hi !== -1) {
    const a = process.argv[hi];
    httpBase = a.startsWith("--http=") ? a.slice("--http=".length) : process.argv[hi + 1];
  }

  const { MONGO_URI } = process.env;
  if (!MONGO_URI) {
    console.error("Missing MONGO_URI");
    process.exit(1);
  }

  console.log("[verify] INVENTORY_ROOT exists:", fs.existsSync(INVENTORY_ROOT), INVENTORY_ROOT);
  console.log("[verify] LEGACY_ROOT exists:", fs.existsSync(LEGACY_ROOT), LEGACY_ROOT);

  await mongoose.connect(MONGO_URI);
  const items = await Cloth.find({}).select("imageUrl name").lean();
  console.log("[verify] Cloth documents:", items.length);

  let broken = 0;
  for (const it of items) {
    const { abs, reason, root } = resolveImageOnDisk(it.imageUrl);
    if (!abs) {
      broken += 1;
      console.warn("[BROKEN]", it._id?.toString(), it.name, "|", it.imageUrl, "|", reason);
      continue;
    }
    if (!fileExistsSafe(abs)) {
      broken += 1;
      console.warn("[BROKEN]", it._id?.toString(), it.name, "|", it.imageUrl);
      console.warn("         expected file:", abs);
      if (root && !fs.existsSync(root)) {
        console.warn("         static root missing:", root);
      }
    }
  }

  if (broken === 0) {
    console.log("[verify] All catalog imageUrl paths resolve to existing files.");
  } else {
    console.log("[verify] Broken paths:", broken, "/", items.length);
    process.exitCode = 1;
  }

  await mongoose.disconnect();

  if (httpBase) {
    console.log("[verify http] Checking URLs against", httpBase);
    await verifyHttp(httpBase);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
