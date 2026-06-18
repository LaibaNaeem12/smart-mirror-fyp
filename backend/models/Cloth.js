const mongoose = require("mongoose");

// Catalog item for the shop inventory.
// Images themselves stay on disk in `frontend/public/dataset`;
// Mongo stores metadata + the URL path to the image.
const clothSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    gender: { type: String, required: false }, // e.g. "men" | "women"
    category: { type: String, required: false }, // e.g. "Shirts" | "Bottoms" | ...
    imageUrl: { type: String, required: true }, // e.g. /dataset/men/Shirts/file.png
    // Optional extra fields for future expansion.
    tags: { type: [String], default: [] },
    price: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cloth", clothSchema);

