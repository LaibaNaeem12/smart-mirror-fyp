/** @typedef {{ deviceId: string, label: string, category: 'external' | 'integrated' | 'unknown' }} VideoInputMeta */

export const CAMERA_DEVICE_STORAGE_KEY = "smart-mirror-camera-device-id";

const LOG_PREFIX = "[SmartMirror:Camera]";

export function readSavedCameraDeviceId() {
  try {
    const v = localStorage.getItem(CAMERA_DEVICE_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function writeSavedCameraDeviceId(deviceId) {
  if (!deviceId) {
    try {
      localStorage.removeItem(CAMERA_DEVICE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    localStorage.setItem(CAMERA_DEVICE_STORAGE_KEY, deviceId);
  } catch {
    /* ignore */
  }
}

/**
 * Heuristic: prefer dedicated USB / external cams over integrated laptop webcams.
 * @param {MediaDeviceInfo} device
 * @returns {'external' | 'integrated' | 'unknown'}
 */
export function classifyVideoInput(device) {
  const label = (device.label || "").toLowerCase();
  if (
    /integrated|built-in|facetime|laptop|pc camera|user-facing|user facing|iris|windows hello/i.test(
      label
    )
  ) {
    return "integrated";
  }
  if (
    /usb|external|logitech|elgato|c920|c922|c930|brio|obs|nexigo|razer|microsoft lifecam|hd pro/i.test(
      label
    )
  ) {
    return "external";
  }
  if (!device.label) return "unknown";
  return "unknown";
}

function rankCategory(category) {
  if (category === "external") return 0;
  if (category === "unknown") return 1;
  return 2;
}

/**
 * @param {MediaDeviceInfo[]} videoInputs
 * @param {string | null} savedDeviceId
 * @returns {string[]} deviceIds to try in order
 */
export function buildCameraTryOrder(videoInputs, savedDeviceId) {
  const list = videoInputs.filter((d) => d.kind === "videoinput");
  const byId = new Map(list.map((d) => [d.deviceId, d]));
  const ordered = [];

  const push = (id) => {
    if (!id || ordered.includes(id)) return;
    if (byId.has(id)) ordered.push(id);
  };

  if (savedDeviceId) push(savedDeviceId);

  const rest = list.filter((d) => d.deviceId !== savedDeviceId);
  rest.sort((a, b) => {
    const ca = classifyVideoInput(a);
    const cb = classifyVideoInput(b);
    const r = rankCategory(ca) - rankCategory(cb);
    if (r !== 0) return r;
    return (a.label || "").localeCompare(b.label || "");
  });
  for (const d of rest) push(d.deviceId);

  return ordered;
}

/**
 * @returns {Promise<MediaDeviceInfo[]>}
 */
export async function enumerateVideoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "videoinput");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const BASE_VIDEO = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

/**
 * @param {string | null} deviceId
 */
export function buildGetUserMediaVideoConstraints(deviceId) {
  if (deviceId) {
    return { video: { ...BASE_VIDEO, deviceId: { exact: deviceId } }, audio: false };
  }
  return {
    video: { ...BASE_VIDEO, facingMode: { ideal: "user" } },
    audio: false,
  };
}

/**
 * @param {MediaStreamConstraints} constraints
 * @param {{ retries?: number, baseDelayMs?: number }} [opts]
 * @returns {Promise<MediaStream>}
 */
export async function getUserMediaWithRetry(constraints, opts = {}) {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 220;
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not supported");
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.info(LOG_PREFIX, "getUserMedia success", { attempt: attempt + 1 });
      return stream;
    } catch (e) {
      lastErr = e;
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        console.warn(LOG_PREFIX, "permission denied, no retry", e);
        throw e;
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        console.warn(LOG_PREFIX, "no device", e);
        throw e;
      }
      console.warn(LOG_PREFIX, "getUserMedia failed, will retry", { attempt: attempt + 1, name, message: e?.message });
      if (attempt < retries - 1) {
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastErr;
}

/**
 * Request a short-lived stream so browser reveals device labels (Chrome).
 * @returns {Promise<void>}
 */
export async function ensureVideoInputLabels() {
  const inputs = await enumerateVideoInputs();
  if (inputs.length === 0) return;
  if (inputs.some((d) => d.label && d.label.trim())) return;
  if (!navigator.mediaDevices?.getUserMedia) return;
  let stream = null;
  try {
    stream = await getUserMediaWithRetry({ video: true, audio: false }, { retries: 2, baseDelayMs: 180 });
  } catch {
    /* labels stay empty until user grants permission elsewhere */
  }
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

/**
 * @param {MediaStream} stream
 */
export function logActiveCameraFromStream(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    console.info(LOG_PREFIX, "no video track on stream");
    return;
  }
  const settings = track.getSettings?.() || {};
  console.info(LOG_PREFIX, "active camera", {
    label: track.label,
    deviceId: settings.deviceId,
    facingMode: settings.facingMode,
    readyState: track.readyState,
  });
}
