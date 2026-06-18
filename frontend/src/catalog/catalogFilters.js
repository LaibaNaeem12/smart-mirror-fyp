/**
 * Single source of truth for catalog filtering.
 * Uses backend fields only: category, imageUrl, name (path parse), gender handled upstream.
 * When category and image path disagree, path segment after gender wins (matches import layout).
 */

export const TAB_ALL = "all";

const UNCATEGORIZED = "__uncategorized__";

/** Map dataset folder / API category slugs → canonical retail bucket (strict buckets, no fuzzy matching). */
const TO_CANONICAL = {
  // tops / shirts
  tops: "shirts",
  top: "shirts",
  shirt: "shirts",
  shirts: "shirts",
  blouse: "shirts",
  blouses: "shirts",
  tee: "shirts",
  tees: "shirts",
  tshirt: "shirts",
  tshirts: "shirts",
  "t-shirt": "shirts",
  "t-shirts": "shirts",
  polos: "shirts",
  polo: "shirts",
  knitwear: "shirts",
  // bottoms
  bottoms: "bottoms",
  bottom: "bottoms",
  pants: "bottoms",
  pant: "bottoms",
  jeans: "bottoms",
  jean: "bottoms",
  denim: "bottoms",
  trousers: "bottoms",
  trouser: "bottoms",
  chinos: "bottoms",
  chino: "bottoms",
  shorts: "bottoms",
  short: "bottoms",
  leggings: "bottoms",
  legging: "bottoms",
  joggers: "bottoms",
  jogger: "bottoms",
  // outerwear (jackets + coats; not hoodies)
  outerwear: "outerwear",
  jacket: "outerwear",
  jackets: "outerwear",
  coat: "outerwear",
  coats: "outerwear",
  overcoat: "outerwear",
  overcoats: "outerwear",
  blazer: "outerwear",
  blazers: "outerwear",
  // hoodies / sweats
  hoodies: "hoodies",
  hoodie: "hoodies",
  sweatshirt: "hoodies",
  sweatshirts: "hoodies",
  sweats: "hoodies",
  // dresses / skirts
  dress: "dresses",
  dresses: "dresses",
  gown: "dresses",
  gowns: "dresses",
  skirt: "skirts",
  skirts: "skirts",
  // traditional / ethnic
  traditional: "traditional",
  ethnic: "traditional",
  festive: "traditional",
  kurta: "traditional",
  kurtas: "traditional",
  sari: "traditional",
  saree: "traditional",
  sarees: "traditional",
};

const TAB_LABEL = {
  shirts: "Shirts & tops",
  bottoms: "Bottom wear",
  outerwear: "Jackets & outerwear",
  hoodies: "Hoodies",
  dresses: "Dresses",
  skirts: "Skirts",
  traditional: "Traditional",
};

/** Preferred tab order; any other canonical keys sort after (e.g. "all" catch-all category). */
const TAB_ORDER = [
  "shirts",
  "bottoms",
  "dresses",
  "skirts",
  "outerwear",
  "hoodies",
  "traditional",
];

export function normCategory(item) {
  return String(item?.category ?? "")
    .trim()
    .toLowerCase();
}

export function formatCategoryLabel(slug) {
  if (!slug) return "";
  return String(slug)
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function slugFromFolderSegment(segment) {
  if (!segment) return null;
  const s = String(segment).trim().toLowerCase();
  if (!s) return null;
  return TO_CANONICAL[s] ?? s;
}

/**
 * Import layout: .../dataset/{gender}/{categoryFolder}/file
 * Uses the folder after men/women (or unisex) as ground truth when present.
 */
export function inferCanonicalFromImageUrl(imageUrl) {
  if (imageUrl == null || imageUrl === "") return null;
  const parts = String(imageUrl)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  const gIdx = parts.findIndex((p) =>
    /^(men|women|male|female|unisex)$/i.test(p)
  );
  if (gIdx >= 0 && gIdx + 1 < parts.length) {
    const folder = parts[gIdx + 1];
    return slugFromFolderSegment(folder);
  }

  return null;
}

function canonicalFromCategoryField(item) {
  const raw = normCategory(item);
  if (!raw) return null;
  return TO_CANONICAL[raw] ?? raw;
}

/**
 * One canonical bucket per item — used for every tab filter.
 */
export function canonicalCatalogKey(item) {
  const fromPath = inferCanonicalFromImageUrl(item?.imageUrl);
  const fromField = canonicalFromCategoryField(item);

  if (fromPath && fromField && fromPath !== fromField) {
    return fromPath;
  }
  if (fromPath) return fromPath;
  if (fromField) return fromField;
  return UNCATEGORIZED;
}

function sortTabKeys(keys) {
  const set = new Set(keys);
  const ordered = [];
  for (const k of TAB_ORDER) {
    if (set.has(k)) ordered.push(k);
  }
  const rest = [...set].filter((k) => !TAB_ORDER.includes(k)).sort();
  return [...ordered, ...rest];
}

function isLikelyBottomWear(item) {
  const bag = `${item?.name || ""} ${item?.category || ""}`.toLowerCase();
  return /\b(pant|pants|trouser|trousers|jean|jeans|chino|chinos|bottom|bottoms|short|shorts)\b/i.test(
    bag
  );
}

export function buildCatalogTabs(items) {
  const tabs = [
    {
      id: TAB_ALL,
      label: "All Collections",
      filter: () => true,
    },
  ];

  const keys = sortTabKeys([...new Set(items.map(canonicalCatalogKey))]);

  for (const key of keys) {
    if (key === UNCATEGORIZED) {
      tabs.push({
        id: `canon:${UNCATEGORIZED}`,
        label: "Uncategorized",
        filter: (i) => canonicalCatalogKey(i) === UNCATEGORIZED,
      });
      continue;
    }

    tabs.push({
      id: `canon:${key}`,
      label: TAB_LABEL[key] || formatCategoryLabel(key),
      filter: (i) => {
        if (canonicalCatalogKey(i) !== key) return false;
        // Surgical fix: in men's "Jackets & outerwear", hide bottom-wear entries that leaked in by naming/data noise.
        if (key === "outerwear" && String(i?.gender || "").toLowerCase() === "men") {
          return !isLikelyBottomWear(i);
        }
        return true;
      },
    });
  }

  return tabs;
}

export function filterItemsByTabId(items, tabs, activeTabId) {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return items;
  return items.filter((i) => tab.filter(i));
}
