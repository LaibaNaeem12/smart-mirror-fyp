import api from "./tryonApi";

function mockStylistReply(prompt, gender, category) {
  const p = String(prompt ?? "").toLowerCase();
  const g = gender === "women" ? "Women's" : gender === "men" ? "Men's" : "This";
  const c = String(category ?? "").trim();
  const catBit = c ? ` For ${c}, ` : " ";
  if (/wedding|bridal|gown/.test(p)) {
    return `${g} rail pairs well with one statement piece and neutral shoes.${catBit}Try a tailored jacket or a fluid dress silhouette — keep jewelry minimal so the mirror read stays clean.`;
  }
  if (/casual|weekend|uni/.test(p)) {
    return `For a relaxed mirror session:${catBit}layer texture (knit + cotton), keep contrast in one place, and let footwear anchor the proportion.`;
  }
  if (/office|work|chic/.test(p)) {
    return `Office-ready framing:${catBit}structured shoulders or a crisp shirt read best on camera — add one soft element so the look feels current, not stiff.`;
  }
  if (/shoe|footwear|heel/.test(p)) {
    return `Shoes finish the line:${catBit}match formality to the hem length, keep tones in the same family as your belt or bag, and step a half-pace back so the mirror catches the full silhouette.`;
  }
  return `${g} session tip:${catBit}pick a focal piece, keep the rest quiet, and use the rail filter to explore categories — everything here updates live for your demo.`;
}

/**
 * POST /api/ai/stylist — local Ollama-backed stylist (via backend).
 * Falls back to mockStylistReply when the request fails.
 * @param {string} prompt
 * @param {string} [gender] — e.g. "men" | "women"
 * @param {string} [category] — e.g. catalog category / garment type
 * @returns {Promise<string>} Assistant reply text (`result` from API)
 */
export async function getStylistAdvice(prompt, gender, category) {
  const p = String(prompt ?? "").trim();
  if (!p) {
    throw new Error("Prompt is empty");
  }

  const body = { prompt: p };
  if (gender != null && String(gender).trim() !== "") {
    body.gender = String(gender).trim();
  }
  if (category != null && String(category).trim() !== "") {
    body.category = String(category).trim();
  }

  const offlineTip =
    "Here’s a quick styling tip: pick a focal piece, keep the rest simple, and explore the rail for pairings.";

  try {
    const { data } = await api.post("/api/ai/stylist", body);

    if (data == null || typeof data.result !== "string") {
      throw new Error("Invalid response from stylist");
    }

    return data.result;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 400) {
      const msg =
        (typeof err.response?.data?.message === "string" && err.response.data.message.trim()) ||
        "Invalid request.";
      throw new Error(msg);
    }
    try {
      return mockStylistReply(p, gender, category);
    } catch {
      return offlineTip;
    }
  }
}
