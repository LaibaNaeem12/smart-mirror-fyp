/**
 * Parse stylist API `result` text into structured outfit cards.
 * Supports v5 labels (same-line or next-line values), numbered legacy, and line-oriented fallback.
 */

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip markdown / bullets so labels match reliably. */
function normalizeStylistText(raw) {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\*\*/g, "")
    .replace(/^[ \t]*[-*•]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

const FIELD_LABELS = {
  styleName: ["Style Name"],
  outfitIdea: ["Outfit Idea", "Outfit idea"],
  colors: ["Colors", "Color", "Color(s)"],
  clothingItems: ["Clothing Items", "Clothing items", "Items"],
  accessories: [
    "Accessories",
    "Accessories (optional)",
    "Accessories (optional only if relevant)",
  ],
  styleTip: ["Style Tip", "Style Tipping", "Quick Style Tip", "Why it works"],
};

const PLACEHOLDER_VALUES = new Set([
  "outfit idea",
  "outfit",
  "colors",
  "color",
  "color(s)",
  "clothing items",
  "items",
  "accessories",
  "style tip",
  "style tipping",
  "look",
  "style name",
]);

function sanitizeFieldValue(v) {
  const cleaned = String(v ?? "").replace(/^[\s:.-]+|[\s:.-]+$/g, "").trim();
  if (!cleaned) return "";
  return PLACEHOLDER_VALUES.has(cleaned.toLowerCase()) ? "" : cleaned;
}

function looksLikeAnotherFieldLabel(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return false;
  return (
    v.startsWith("style name") ||
    v.startsWith("outfit idea") ||
    v.startsWith("colors") ||
    v.startsWith("color") ||
    v.startsWith("clothing items") ||
    v.startsWith("items") ||
    v.startsWith("accessories") ||
    v.startsWith("style tip") ||
    v.startsWith("style tipping") ||
    v.startsWith("quick style tip") ||
    v.startsWith("why it works")
  );
}

function pickLabeled(text, label) {
  const re = new RegExp(`^\\s*${escapeRe(label)}\\s*:\\s*(.+)`, "im");
  const m = text.match(re);
  return m ? sanitizeFieldValue(m[1]) : "";
}

function pickLabeledLoose(text, label) {
  const re = new RegExp(`(?:^|[\\n\\r])\\s*${escapeRe(label)}\\s*:\\s*([^\\n\\r]+)`, "i");
  const m = text.match(re);
  return m ? sanitizeFieldValue(m[1]) : "";
}

function pickLabeledAnywhere(text, label) {
  const re = new RegExp(`${escapeRe(label)}\\s*:\\s*([^\\n\\r]+)`, "i");
  const m = text.match(re);
  return m ? sanitizeFieldValue(m[1]) : "";
}

function pickField(text, label) {
  return pickLabeled(text, label) || pickLabeledLoose(text, label) || pickLabeledAnywhere(text, label);
}

function pickByAliases(text, aliases) {
  for (const alias of aliases) {
    const v = pickField(text, alias);
    if (v) return v;
  }
  return "";
}

function extractLabeledBlock(chunk) {
  const styleFromLabel = pickByAliases(chunk, FIELD_LABELS.styleName);
  return {
    styleName: styleFromLabel || "Look",
    outfitIdea: pickByAliases(chunk, FIELD_LABELS.outfitIdea),
    colors: pickByAliases(chunk, FIELD_LABELS.colors),
    clothingItems: pickByAliases(chunk, FIELD_LABELS.clothingItems),
    accessories: pickByAliases(chunk, FIELD_LABELS.accessories),
    styleTip: pickByAliases(chunk, FIELD_LABELS.styleTip),
  };
}

function hasAnyField(o) {
  return !!(o.outfitIdea || o.colors || o.clothingItems || o.accessories || o.styleTip);
}

function splitStyleNameBlocks(text) {
  if (!/Style Name\s*:/i.test(text)) return [];
  const chunks = text
    .split(/\n(?=\s*Style Name\s*:)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return chunks.length ? chunks : [text.trim()];
}

function extractNumberedLegacy(text) {
  const pickNum = (n, label) => {
    const strict = pickLabeled(text, `${n}. ${label}`);
    if (strict) return strict;
    const re = new RegExp(`\\b${n}\\.\\s*${escapeRe(label)}\\s*:\\s*([^\\n\\r]+)`, "i");
    return text.match(re)?.[1]?.trim() || "";
  };

  const idea =
    pickNum(1, "Outfit Idea") ||
    text.match(/\b1\.\s*Outfit Idea\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ||
    "";
  const colors = pickNum(2, "Colors") || text.match(/\b2\.\s*Colors\s*:\s*([^\n\r]+)/i)?.[1]?.trim() || "";
  const items =
    pickNum(3, "Clothing Items") || text.match(/\b3\.\s*Clothing Items\s*:\s*([^\n\r]+)/i)?.[1]?.trim() || "";
  const acc =
    pickNum(4, "Accessories") ||
    text.match(/\b4\.\s*Accessories(?:\s*\([^)]*\))?\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ||
    "";
  const tip =
    pickNum(5, "Style Tip") ||
    pickField(text, "6. Quick Style Tip") ||
    pickField(text, "6. Why it works") ||
    text.match(/\b6\.\s*Why it works\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ||
    "";

  if (!idea && !items && !colors) return null;
  const sn = text.match(/(?:^|[\n\r])\s*Style Name\s*:\s*([^\n\r]+)/i);
  return {
    styleName: (sn && sn[1].trim()) || "Look",
    outfitIdea: idea,
    colors,
    clothingItems: items,
    accessories: acc,
    styleTip: tip,
  };
}

/** Line scan: label on one line, value same line OR following lines until next label. */
const LINE_LABELS = [
  ["style name", "styleName"],
  ["outfit idea", "outfitIdea"],
  ["colors", "colors"],
  ["color(s)", "colors"],
  ["color", "colors"],
  ["clothing items", "clothingItems"],
  ["items", "clothingItems"],
  ["accessories", "accessories"],
  ["style tip", "styleTip"],
  ["style tipping", "styleTip"],
  ["quick style tip", "styleTip"],
  ["why it works", "styleTip"],
];

function parseLineOriented(text) {
  const obj = {
    styleName: "",
    outfitIdea: "",
    colors: "",
    clothingItems: "",
    accessories: "",
    styleTip: "",
  };
  const lines = text.split("\n");
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\*\*/g, "").trim();
    if (!line) continue;

    let hit = null;
    for (const [label, key] of LINE_LABELS) {
      const re = new RegExp(`^${escapeRe(label)}\\s*:?\\s*(.*)$`, "i");
      const m = line.match(re);
      if (m) {
        hit = { key, rest: sanitizeFieldValue(m[1]) };
        break;
      }
    }

    if (hit) {
      currentKey = hit.key;
      if (hit.rest) {
        obj[currentKey] = obj[currentKey] ? `${obj[currentKey]} ${hit.rest}` : hit.rest;
      }
    } else if (currentKey) {
      const continuation = sanitizeFieldValue(line);
      if (continuation && !looksLikeAnotherFieldLabel(continuation)) {
        obj[currentKey] = obj[currentKey] ? `${obj[currentKey]} ${continuation}` : continuation;
      }
    }
  }

  if (looksLikeAnotherFieldLabel(obj.clothingItems)) obj.clothingItems = "";
  if (looksLikeAnotherFieldLabel(obj.colors)) obj.colors = "";
  if (looksLikeAnotherFieldLabel(obj.accessories)) obj.accessories = "";
  if (looksLikeAnotherFieldLabel(obj.styleTip)) obj.styleTip = "";

  if (!hasAnyField(obj)) return [];
  if (!String(obj.styleName || "").trim()) obj.styleName = "Look";
  if (PLACEHOLDER_VALUES.has(String(obj.styleName).toLowerCase())) {
    obj.styleName = "Look";
  }
  return [obj];
}

function toSentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fallbackFromProse(text) {
  const cleaned = String(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sents = toSentences(cleaned);
  const first = (sents[0] || cleaned).slice(0, 180).trim();
  const second = (sents[1] || "").slice(0, 140).trim();
  return [
    {
      styleName: "Smart Mirror Look",
      outfitIdea: sanitizeFieldValue(first),
      colors: "",
      clothingItems: "",
      accessories: "",
      styleTip: sanitizeFieldValue(second) || "Keep proportions clean and accessories minimal.",
    },
  ];
}

/**
 * @param {string} raw
 * @returns {Array<{ styleName: string, outfitIdea: string, colors: string, clothingItems: string, accessories: string, styleTip: string }>}
 */
export function parseStylistOutfits(raw) {
  const text = normalizeStylistText(raw);
  if (!text) return [];

  const blocks = splitStyleNameBlocks(text);
  if (blocks.length > 0) {
    const out = blocks.map((b) => extractLabeledBlock(b)).filter((o) => hasAnyField(o));
    if (out.length) return out;
  }

  const numbered = extractNumberedLegacy(text);
  if (numbered) return [numbered];

  const labeled = extractLabeledBlock(text);
  if (hasAnyField(labeled)) {
    return [labeled];
  }

  const loose = parseLineOriented(text);
  if (loose.length) return loose;

  return fallbackFromProse(text);
}
