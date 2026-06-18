const express = require("express");
const Cloth = require("../models/Cloth");
const { absoluteAssetUrl } = require("../utils/absoluteAssetUrl");
const { isDbConnected, shouldServeMockCatalog } = require("../dbState");

const router = express.Router();

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mockCatalogItems(req) {
  return [
    {
      _id: "1",
      name: "White Shirt",
      gender: "men",
      category: "shirts",
      imageUrl: absoluteAssetUrl(req, "/dataset/men/tops/men_shirt_001.png"),
    },
    {
      _id: "2",
      name: "Black Kurta",
      gender: "men",
      category: "traditional",
      imageUrl: absoluteAssetUrl(req, "/dataset/men/tops/men_shirt_002.png"),
    },
    {
      _id: "3",
      name: "Jacket",
      gender: "men",
      category: "outerwear",
      imageUrl: absoluteAssetUrl(req, "/dataset/men/outerwear/men_jacket_001.png"),
    },
    {
      _id: "4",
      name: "White Shirt",
      gender: "women",
      category: "shirts",
      imageUrl: absoluteAssetUrl(req, "/dataset/men/tops/men_shirt_001.png"),
    },
    {
      _id: "5",
      name: "Black Kurta",
      gender: "women",
      category: "traditional",
      imageUrl: absoluteAssetUrl(req, "/dataset/men/tops/men_shirt_002.png"),
    },
    {
      _id: "6",
      name: "Jacket",
      gender: "women",
      category: "outerwear",
      imageUrl: absoluteAssetUrl(req, "/dataset/men/outerwear/men_jacket_001.png"),
    },
  ];
}

function filterMockItems(items, gender, category, q) {
  let list = items;
  if (gender) {
    const g = String(gender).toLowerCase();
    list = list.filter((it) => String(it.gender || "").toLowerCase() === g);
  }
  if (category) {
    const c = String(category).trim();
    list = list.filter((it) => new RegExp(`^${escapeRegExp(c)}$`, "i").test(String(it.category || "")));
  }
  if (q) {
    const qq = String(q).toLowerCase();
    list = list.filter((it) => String(it.name || "").toLowerCase().includes(qq));
  }
  return list;
}

// GET /api/catalog/items?gender=men&category=Shirts&q=&limit=20&offset=0
router.get("/items", async (req, res) => {
  try {
    const {
      gender,
      category,
      q = "",
      limit = "20",
      offset = "0",
    } = req.query;

    const parsedLimit = Math.max(1, Math.min(100, Number(limit)));
    const parsedOffset = Math.max(0, Number(offset));

    if (shouldServeMockCatalog()) {
      const all = mockCatalogItems(req);
      const filtered = filterMockItems(all, gender, category, q);
      const total = filtered.length;
      const slice = filtered.slice(parsedOffset, parsedOffset + parsedLimit);
      return res.json({ items: slice, total });
    }

    if (!isDbConnected()) {
      return res.json({ items: [], total: 0 });
    }

    const filter = {};
    if (gender)
      filter.gender = {
        $regex: new RegExp(`^${escapeRegExp(String(gender))}$`, "i"),
      };
    if (category)
      filter.category = {
        $regex: new RegExp(`^${escapeRegExp(String(category))}$`, "i"),
      };
    if (q) filter.name = { $regex: String(q), $options: "i" };

    const [items, total] = await Promise.all([
      Cloth.find(filter)
        .sort({ createdAt: -1 })
        .skip(parsedOffset)
        .limit(parsedLimit),
      Cloth.countDocuments(filter),
    ]);

    const payloadItems = items.map((it) => ({
      _id: it._id,
      name: it.name,
      gender: it.gender,
      category: it.category,
      imageUrl: absoluteAssetUrl(req, it.imageUrl),
    }));

    return res.json({ items: payloadItems, total });
  } catch (err) {
    console.error("catalog/items error:", err);
    if (shouldServeMockCatalog()) {
      const all = mockCatalogItems(req);
      const filtered = filterMockItems(
        all,
        req.query.gender,
        req.query.category,
        req.query.q || ""
      );
      const parsedLimit = Math.max(1, Math.min(100, Number(req.query.limit || "20")));
      const parsedOffset = Math.max(0, Number(req.query.offset || "0"));
      return res.json({
        items: filtered.slice(parsedOffset, parsedOffset + parsedLimit),
        total: filtered.length,
      });
    }
    return res.status(500).json({ message: err?.message || "Catalog error" });
  }
});

module.exports = router;
