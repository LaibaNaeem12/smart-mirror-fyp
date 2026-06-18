/**
 * Client-side match: AI outfit text → catalog rail items (strict; no weak category-only hits).
 */

const HINTS = [
  ["kurta", "traditional"],
  ["shalwar", "traditional"],
  ["dupatta", "traditional"],
  ["sari", "traditional"],
  ["saree", "traditional"],
  ["dress", "dresses"],
  ["gown", "dresses"],
  ["jeans", "bottoms"],
  ["chino", "bottoms"],
  ["trouser", "bottoms"],
  ["shirt", "shirts"],
  ["blouse", "shirts"],
  ["hoodie", "hoodies"],
  ["jacket", "outerwear"],
  ["blazer", "outerwear"],
  ["skirt", "skirts"],
];

/** Words that must not alone drive a match (avoid generic “pants / bottoms” picks). */
const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "outfit",
  "look",
  "looks",
  "style",
  "wear",
  "wearing",
  "piece",
  "pieces",
  "set",
  "idea",
  "ideas",
  "simple",
  "clean",
  "modern",
  "casual",
  "formal",
  "smart",
  "nice",
  "great",
  "good",
  "best",
  "your",
  "this",
  "that",
  "from",
  "into",
  "tops",
  "bottoms",
  "top",
  "bottom",
]);

/** Common LLM typos → canonical token for better rail matching. */
const TOKEN_FIXUPS = {
  bloose: "blouse",
  blouze: "blouse",
  skipt: "skirt",
  skrit: "skirt",
  trouserz: "trousers",
};

const OCCASION_TO_CATEGORIES = [
  {
    re: /\bwedding|bridal|party|evening|night|guest|festive\b/i,
    cats: ["traditional", "dresses", "outerwear", "shirts"],
  },
  { re: /\boffice|work|formal|meeting\b/i, cats: ["shirts", "bottoms", "outerwear"] },
  { re: /\bcasual|weekend|daily|everyday|campus|university|uni\b/i, cats: ["shirts", "hoodies", "outerwear"] },
  { re: /\btraditional|ethnic|kurta|shalwar|saree|sari\b/i, cats: ["traditional"] },
];

function canonicalCategory(raw) {
  const c = String(raw || "").toLowerCase().trim();
  if (!c) return "";
  if (c === "tops" || c === "top" || c === "shirt" || c === "shirts" || c === "blouse") return "shirts";
  if (c === "dresses" || c === "dress" || c === "gown" || c === "gowns") return "dresses";
  if (c === "bottoms" || c === "bottom" || c === "pants" || c === "jeans" || c === "trousers") return "bottoms";
  if (c === "outerwear" || c === "jacket" || c === "blazer") return "outerwear";
  if (c === "hoodies" || c === "hoodie") return "hoodies";
  if (c === "traditional" || c === "ethnic") return "traditional";
  if (c === "skirts" || c === "skirt") return "skirts";
  return c;
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(s) {
  return norm(s)
    .split(/\s+/)
    .map((w) => TOKEN_FIXUPS[w] || w)
    .filter((w) => w.length > 2);
}

function meaningfulTokens(outfit) {
  const bag = `${outfit.styleName} ${outfit.outfitIdea} ${outfit.clothingItems} ${outfit.colors} ${outfit.styleTip}`;
  return [...new Set(words(bag).filter((w) => !STOP.has(w)))];
}

const MIN_SCORE = 5;

function inGender(it, gender) {
  if (!gender || !it?.gender) return true;
  return String(it.gender).toLowerCase() === String(gender).toLowerCase();
}

function uniqueById(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const id = String(it?._id ?? it?.id ?? `${it?.name}-${it?.imageUrl}`);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(it);
  }
  return out;
}

function fallbackByOccasion(outfit, items, gender, limit) {
  const text = norm(
    `${outfit.styleName} ${outfit.outfitIdea} ${outfit.clothingItems} ${outfit.colors} ${outfit.styleTip}`
  );

  const genderItems = items.filter((it) => inGender(it, gender));
  if (!genderItems.length) return [];

  for (const rule of OCCASION_TO_CATEGORIES) {
    if (!rule.re.test(text)) continue;
    const picked = genderItems.filter((it) => rule.cats.includes(canonicalCategory(it.category)));
    if (picked.length) return uniqueById(picked).slice(0, limit);
  }

  return [];
}

/**
 * @param {object} outfit
 * @param {Array<object>} catalogItems
 * @param {string} [gender]
 * @param {number} [limit]
 * @returns {Array<object>} best-first; empty if nothing meets confidence bar
 */
export function matchCatalogForOutfit(outfit, catalogItems, gender, limit = 3) {
  const items = Array.isArray(catalogItems) ? catalogItems : [];
  if (!items.length) return [];

  const needle = norm(
    `${outfit.styleName} ${outfit.outfitIdea} ${outfit.clothingItems} ${outfit.colors} ${outfit.styleTip}`
  );
  const tokens = meaningfulTokens(outfit);
  if (!tokens.length) return [];

  const scored = items.map((it) => {
    if (gender && it.gender && String(it.gender).toLowerCase() !== String(gender).toLowerCase()) {
      return { it, s: 0 };
    }
    const nameHay = norm(it.name || "");
    const catCanon = canonicalCategory(it.category);
    const catHay = norm(catCanon);
    const hay = `${nameHay} ${catHay}`;

    let nameScore = 0;
    let nameHits = 0;
    for (const w of tokens) {
      if (nameHay.includes(w)) {
        nameScore += 4;
        nameHits += 1;
      }
    }

    let hintScore = 0;
    for (const [word, cat] of HINTS) {
      if (needle.includes(word) && hay.includes(cat)) {
        hintScore += 5;
      }
    }

    let s = nameScore + hintScore;
    /* Block category-only noise; allow strong keyword+category hints without name token (e.g. kurta). */
    if (nameHits === 0 && hintScore < 5) {
      s = 0;
    }

    return { it, s };
  });

  const strict = scored
    .filter((x) => x.s >= MIN_SCORE)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);

  if (strict.length) return strict;

  const occasion = fallbackByOccasion(outfit, items, gender, limit);
  if (occasion.length) return occasion;

  return [];
}
