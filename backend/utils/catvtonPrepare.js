/**
 * Build CATVTON-Flux (mmezhov/catvton-flux) inputs: person image, agnostic torso mask, garment URL.
 */

const sharp = require("sharp");
const { bufferFromImageRef } = require("./tryOnDemoComposite");

/**
 * @param {number} width
 * @param {number} height
 * @returns {Promise<string>} data:image/png;base64,...
 */
async function buildTorsoMaskDataUrl(width, height) {
  const w = Math.max(64, Math.round(width));
  const h = Math.max(64, Math.round(height));
  const cx = w / 2;
  const cy = h * 0.39;
  const rx = w * 0.28;
  const ry = h * 0.21;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/></svg>`;
  const maskBuf = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${maskBuf.toString("base64")}`;
}

/**
 * Resize person to model canvas; garment is passed through as URL/data (model resizes).
 * @param {string} personImage
 * @param {string} garmentImage
 * @param {{ width?: number, height?: number }} [dims]
 * @returns {Promise<{ image: string, mask: string, garment: string }>}
 */
async function buildCatvtonImages(personImage, garmentImage, dims = {}) {
  const width = Math.max(256, Math.min(1024, Number(dims.width || 576) || 576));
  const height = Math.max(256, Math.min(1536, Number(dims.height || 768) || 768));

  const buf = await bufferFromImageRef(personImage);
  const personJpeg = await sharp(buf)
    .rotate()
    .resize({
      width,
      height,
      fit: "contain",
      position: "centre",
      background: { r: 245, g: 246, b: 250, alpha: 1 },
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const image = `data:image/jpeg;base64,${personJpeg.toString("base64")}`;
  const mask = await buildTorsoMaskDataUrl(width, height);
  const garment = String(garmentImage || "").trim();
  if (!garment) throw new Error("garment image ref required for CATVTON");

  return { image, mask, garment };
}

module.exports = { buildCatvtonImages, buildTorsoMaskDataUrl };
