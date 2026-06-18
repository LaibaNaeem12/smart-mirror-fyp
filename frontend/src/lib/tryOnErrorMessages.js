/**
 * Maps network / HTTP failures from try-on requests to kiosk-friendly copy.
 * Never surfaces raw API payloads or stack traces in the UI.
 * @param {unknown} err - typically an Axios error
 * @returns {string}
 */
export function mapTryOnErrorToUserMessage(err) {
  if (err && typeof err === "object") {
    const o = /** @type {{ code?: string, message?: string }} */ (err);
    if (o.code === "ERR_NETWORK") {
      return "We could not reach the mirror. Check the connection and try again.";
    }
    if (o.code === "ECONNABORTED") {
      return "The request was interrupted. Please try again.";
    }
  }

  const status =
    err && typeof err === "object" && "response" in err
      ? /** @type {{ response?: { status?: number } }} */ (err).response?.status
      : undefined;

  if (status === 504) {
    return "The mirror is still working in the background, but this session timed out. Please tap Try again.";
  }
  if (status === 502) {
    return "The styling preview is temporarily unavailable. Please try again in a moment.";
  }
  if (status === 503) {
    return "The mirror is busy right now. Please wait a moment and try again.";
  }
  if (status === 429) {
    return "Please wait a brief moment before trying again.";
  }
  if (status === 400) {
    return "We could not use that photo for try-on. Try retaking with even lighting.";
  }
  if (status === 404) {
    return "That look is no longer available. Please choose another piece from the rail.";
  }
  if (status === 500) {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  if (err && typeof err === "object" && "response" in err && !/** @type {{ response?: unknown }} */ (err).response) {
    return "We could not reach the mirror. Check the connection and try again.";
  }
  return "Try-on needs another attempt. Please tap Try again.";
}
