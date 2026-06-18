/**
 * Offline / exhibition fallback try-on: instant "AI style suggestions" when API is slow or fails.
 * Pure client-side — no API contract changes.
 */

const TEMPLATE_LABELS = [
  "Evening refinement",
  "Studio minimal",
  "Weekend ease",
  "Runway edge",
];

/**
 * @param {string | number | undefined} seed
 */
function hashSeed(seed) {
  const s = String(seed ?? "0");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

/**
 * @param {unknown} item
 * @returns {string | null}
 */
function itemImageUrl(item) {
  if (!item || typeof item !== "object") return null;
  const u = /** @type {{ imageUrl?: string, image?: string }} */ (item).imageUrl
    ?? /** @type {{ image?: string }} */ (item).image;
  if (typeof u !== "string" || !u.trim()) return null;
  return u.trim();
}

/**
 * @param {object} params
 * @param {string | null} [params.userImageUrl]
 * @param {string | null} [params.garmentImageUrl]
 * @param {unknown[]} [params.catalogItems]
 * @param {string | null} [params.lastSuccessProcessedUrl]
 * @param {string | null} [params.clothId]
 * @param {string | null} [params.clothName]
 * @param {string | null} [params.category]
 * @returns {{ cards: Array<{ id: string, title: string, imageUrl: string, hint: string }>, heroPreviewUrl: string | null, source: string }}
 */
export function buildFallbackTryOnBundle({
  userImageUrl = null,
  garmentImageUrl = null,
  catalogItems = [],
  lastSuccessProcessedUrl = null,
  clothId = null,
  clothName = null,
  category = null,
}) {
  const seed = hashSeed(clothId ?? clothName ?? Date.now());
  const cards = [];

  const pool = Array.isArray(catalogItems)
    ? catalogItems.map((it, i) => ({ it, i })).filter(({ it }) => itemImageUrl(it))
    : [];

  const used = new Set();
  const pickFromPool = (offset) => {
    if (!pool.length) return null;
    const idx = (seed + offset) % pool.length;
    let j = 0;
    while (j < pool.length) {
      const p = pool[(idx + j) % pool.length];
      const url = itemImageUrl(p.it);
      if (url && !used.has(url)) {
        used.add(url);
        return { url, item: p.it };
      }
      j += 1;
    }
    return null;
  };

  if (garmentImageUrl) {
    cards.push({
      id: "fallback-selected",
      title: clothName?.trim() || "Your rail pick",
      imageUrl: garmentImageUrl,
      hint: category ? `${category} · curated match` : "Selected for your session",
    });
    used.add(garmentImageUrl);
  }

  for (let k = 0; k < 4 && cards.length < 4; k += 1) {
    const picked = pickFromPool(k * 7);
    if (!picked) break;
    const name =
      /** @type {{ name?: string }} */ (picked.item).name?.trim() || TEMPLATE_LABELS[(seed + k) % TEMPLATE_LABELS.length];
    cards.push({
      id: `fallback-cat-${k}`,
      title: name,
      imageUrl: picked.url,
      hint: "AI style suggestion",
    });
  }

  while (cards.length < 4) {
    const label = TEMPLATE_LABELS[(seed + cards.length) % TEMPLATE_LABELS.length];
    cards.push({
      id: `fallback-template-${cards.length}`,
      title: label,
      imageUrl: garmentImageUrl || userImageUrl || "",
      hint: "Look inspiration",
    });
    if (cards[cards.length - 1].imageUrl) break;
  }

  const heroPreviewUrl =
    lastSuccessProcessedUrl ||
    garmentImageUrl ||
    userImageUrl ||
    (cards[0]?.imageUrl ? cards[0].imageUrl : null);

  return {
    cards: cards.filter((c) => c.imageUrl),
    heroPreviewUrl,
    source: lastSuccessProcessedUrl ? "last_success" : garmentImageUrl ? "garment" : "catalog",
  };
}
