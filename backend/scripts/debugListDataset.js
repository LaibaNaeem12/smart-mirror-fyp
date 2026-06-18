const fs = require("fs");
const path = require("path");

const DATASET_ROOT = path.join(__dirname, "../../frontend/public/dataset");
const OUT = path.join(__dirname, "../../dataset-tree.txt");

function walk(dir, depth, lines) {
  if (depth < 0) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    lines.push(`ERROR reading ${dir}: ${e.message}`);
    return;
  }

  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(DATASET_ROOT, full);
    if (ent.isDirectory()) {
      lines.push(`DIR  ${rel}`);
      walk(full, depth - 1, lines);
    } else {
      lines.push(`FILE ${rel}`);
    }
  }
}

const lines = [];
lines.push(`DATASET_ROOT=${DATASET_ROOT}`);
if (!fs.existsSync(DATASET_ROOT)) {
  lines.push("Dataset root not found.");
} else {
  walk(DATASET_ROOT, 3, lines);
}

fs.writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(`Wrote ${OUT}`);

