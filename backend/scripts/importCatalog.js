const { loadEnv } = require("../config/loadEnv");
loadEnv();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Cloth = require("../models/Cloth");

const DATASET_ROOT = path.join(__dirname, "../../frontend/public/dataset");

async function main() {
  const { MONGO_URI } = process.env;
  if (!MONGO_URI) {
    throw new Error("Missing MONGO_URI in backend/.env");
  }

  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected");

  // Import strategy:
  // frontend/public/dataset/<gender>/<category>/<file>
  // gender/category are inferred from folder names.
  const genders = fs.existsSync(DATASET_ROOT)
    ? fs
        .readdirSync(DATASET_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  if (!genders.length) {
    console.log(`No dataset folders found at: ${DATASET_ROOT}`);
    return;
  }

  const docs = [];

  for (const gender of genders) {
    const genderDir = path.join(DATASET_ROOT, gender);
    const entries = fs.readdirSync(genderDir, { withFileTypes: true });
    const categoryDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);
    const directFiles = entries.filter((f) => f.isFile()).map((f) => f.name);

    // Structure A: dataset/<gender>/<category>/<images>
    for (const category of categoryDirs) {
      const categoryDir = path.join(genderDir, category);
      const files = fs
        .readdirSync(categoryDir, { withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => f.name);

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!ext.match(/\.(png|jpe?g|webp|gif|svg)$/)) continue;

        const baseName = path.basename(file, ext);
        const name = baseName.replace(/[_-]+/g, " ");

        docs.push({
          name,
          gender,
          category,
          imageUrl: `/dataset/${gender}/${category}/${file}`,
        });
      }
    }

    // Structure B: dataset/<gender>/<images>  (no category subfolders)
    for (const file of directFiles) {
      const ext = path.extname(file).toLowerCase();
      if (!ext.match(/\.(png|jpe?g|webp|gif|svg)$/)) continue;

      const baseName = path.basename(file, ext);
      const name = baseName.replace(/[_-]+/g, " ");

      docs.push({
        name,
        gender,
        category: "All",
        imageUrl: `/dataset/${gender}/${file}`,
      });
    }
  }

  if (!docs.length) {
    console.log("No images found to import.");
    return;
  }

  // Keep it simple for now: wipe & re-import.
  await Cloth.deleteMany({});
  await Cloth.insertMany(docs);

  console.log(`Imported ${docs.length} catalog items.`);
  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

