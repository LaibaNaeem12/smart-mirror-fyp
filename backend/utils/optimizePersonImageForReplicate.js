/**
 * Resize + compress person image before Replicate (smaller payload → faster queue).
 * Target: max 768×1024 (fit inside), JPEG q 0.7, strip metadata.
 *
 * @param {string} dataUrl - data:image/...;base64,...
 * @returns {Promise<{ dataUrl: string, meta: Record<string, unknown> }>}
 */
async function optimizePersonImageForReplicate(dataUrl) {
  const meta = /** @type {Record<string, unknown>} */ ({
    skipped: false,
    reason: null,
  });

  if (typeof dataUrl !== "string" || !/^data:image\//i.test(dataUrl)) {
    meta.skipped = true;
    meta.reason = "not_data_url";
    return { dataUrl, meta };
  }

  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    meta.skipped = true;
    meta.reason = "malformed_data_url";
    return { dataUrl, meta };
  }

  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    meta.skipped = true;
    meta.reason = "base64_decode_failed";
    return { dataUrl, meta };
  }

  const bytesIn = buf.length;
  meta.bytesIn = bytesIn;
  meta.bytesInMB = Number((bytesIn / (1024 * 1024)).toFixed(3));
  const m = /^data:image\/(jpeg|jpg|png|webp)/i.exec(header);
  meta.formatIn = m ? m[1].toLowerCase() : "unknown";

  let sharp;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    sharp = require("sharp");
  } catch {
    meta.skipped = true;
    meta.reason = "sharp_not_installed";
    return { dataUrl, meta };
  }

  try {
    const img = sharp(buf, { failOn: "none" }).rotate();
    const info = await img.metadata();
    meta.widthIn = info.width ?? null;
    meta.heightIn = info.height ?? null;

    const outBuf = await img
      .resize(768, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer({ resolveWithObject: true });

    const out = outBuf.data;
    const outInfo = outBuf.info;
    meta.bytesOut = out.length;
    meta.bytesOutMB = Number((out.length / (1024 * 1024)).toFixed(3));
    meta.widthOut = outInfo.width ?? null;
    meta.heightOut = outInfo.height ?? null;
    meta.formatOut = "jpeg";

    const outDataUrl = `data:image/jpeg;base64,${out.toString("base64")}`;
    return { dataUrl: outDataUrl, meta };
  } catch (e) {
    meta.skipped = true;
    meta.reason = "sharp_processing_failed";
    meta.error = e instanceof Error ? e.message : String(e);
    return { dataUrl, meta };
  }
}

module.exports = { optimizePersonImageForReplicate };
