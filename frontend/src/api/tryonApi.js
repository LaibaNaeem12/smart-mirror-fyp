import axios from "axios";
import { isTryOnFlowDebug, summarizeTryOnImageField } from "../lib/tryOnFlowDebug";

const baseURL = import.meta.env.VITE_API_BASE_URL;

if (import.meta.env.DEV && !baseURL) {
  console.warn(
    "[api] VITE_API_BASE_URL is missing. Add it to frontend/.env (see .env.example)."
  );
}

const api = axios.create({
  baseURL: baseURL || undefined,
  headers: {
    "Content-Type": "application/json",
  },
});

/** Replicate try-on can sit in "starting" for many minutes — never use axios default short timeouts here. */
const TRY_ON_HTTP_TIMEOUT_MS = 600000;

export async function fetchCatalogPage(params) {
  const { data } = await api.get("/api/catalog/items", { params });
  return data;
}

/**
 * Loads every catalog page for optional filters (e.g. gender=men|women).
 * Backend limit max 100 per request.
 */
export async function fetchAllCatalogItems(options = {}) {
  const { gender, category, q } = options;
  const limit = 100;
  let offset = 0;
  const all = [];
  let total = 0;

  const paramsBase = {};
  if (gender) paramsBase.gender = gender;
  if (category) paramsBase.category = category;
  if (q) paramsBase.q = q;

  for (;;) {
    const { items, total: t } = await fetchCatalogPage({
      limit,
      offset,
      ...paramsBase,
    });
    total = t;
    all.push(...items);
    offset += items.length;
    if (!items.length || all.length >= total) break;
  }

  return all;
}

/**
 * Virtual try-on: garment + optional webcam capture (data URL in webcamImage).
 * Backend returns { clothId, originalImage, processedImage, status }.
 *
 * @param {object} body
 * @param {string} body.clothId
 * @param {string} [body.gender]
 * @param {string} [body.category]
 * @param {string} [body.mode]
 * @param {string} [body.webcamImage] - optional data URL or raw base64 (JPEG); enables person+garment pipeline
 */
export async function postTryOn(body, options = {}) {
  const { signal } = options;
  const { data } = await api.post("/api/tryon", body, {
    signal,
    timeout: TRY_ON_HTTP_TIMEOUT_MS,
  });
  if (isTryOnFlowDebug()) {
    console.info("[try-on flow] frontend received payload (POST /api/tryon)", {
      clothId: data?.clothId,
      status: data?.status,
      originalImage: summarizeTryOnImageField("originalImage", data?.originalImage),
      processedImage: summarizeTryOnImageField("processedImage", data?.processedImage),
    });
  }
  return data;
}

/**
 * Poll async try-on prediction state.
 * @param {string} predictionId
 * @param {{ signal?: AbortSignal, startedAt?: number }} [options]
 */
export async function getTryOnStatus(predictionId, options = {}) {
  const id = String(predictionId || "").trim();
  const { data } = await api.get(`/api/tryon/status/${encodeURIComponent(id)}`, {
    params: options.startedAt ? { startedAt: options.startedAt } : undefined,
    signal: options.signal,
    timeout: TRY_ON_HTTP_TIMEOUT_MS,
  });
  return data;
}

export default api;
