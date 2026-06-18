import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_CONSTRAINTS = {
  video: {
    facingMode: { ideal: "user" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

/**
 * @typedef {object} WebcamCapturePayload
 * @property {string} dataUrl - image/jpeg data URL
 * @property {Blob} blob - image/jpeg blob
 */

/**
 * Live webcam preview with start / capture / stop. Uses getUserMedia.
 *
 * @param {object} props
 * @param {(payload: WebcamCapturePayload) => void} props.onCapture
 * @param {string | null} [props.previewDataUrl] - Last capture preview from parent (controlled)
 */
export default function WebcamCapture({ onCapture, previewDataUrl = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const stopTracks = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const el = videoRef.current;
    if (el) {
      el.srcObject = null;
    }
    setActive(false);
  }, []);

  useEffect(() => () => stopTracks(), [stopTracks]);

  const startCamera = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported in this browser.");
      return;
    }
    try {
      stopTracks();
      const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setActive(true);
    } catch (e) {
      const name = e?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Camera permission denied.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No camera found.");
      } else {
        setError("Could not start camera.");
      }
      stopTracks();
    }
  }, [stopTracks]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setError("Video not ready — wait a moment and try again.");
      return;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    canvas.toBlob(
      (blob) => {
        if (blob && typeof onCapture === "function") {
          onCapture({ dataUrl, blob });
        }
      },
      "image/jpeg",
      0.92
    );
  }, [onCapture]);

  return (
    <div className="relative z-10 mb-1 flex min-h-0 shrink-0 flex-col gap-1.5 rounded-xl border border-kiosk-border bg-kiosk-surface p-1.5 shadow-kiosk-inset lg:mb-1.5 lg:gap-2 lg:rounded-[1rem] lg:p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-kiosk-muted lg:text-[10px]">
        Mirror camera
      </p>

      <div className="flex min-h-0 flex-wrap items-center gap-2 lg:gap-2.5">
        <div className="relative h-[4.5rem] w-[6rem] shrink-0 overflow-hidden rounded-lg border border-kiosk-border bg-kiosk-layer ring-1 ring-kiosk-border/60 sm:h-[5rem] sm:w-[6.75rem] lg:h-[5.5rem] lg:w-[7.25rem]">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
            aria-label="Live camera preview"
          />
          {!active ? (
            <div className="absolute inset-0 flex items-center justify-center bg-kiosk-layer text-[9px] font-medium text-kiosk-muted lg:text-[10px]">
              Off
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 lg:gap-2">
          <button
            type="button"
            onClick={startCamera}
            disabled={active}
            className="rounded-lg border border-kiosk-border bg-white px-2 py-1.5 text-[9px] font-semibold text-kiosk-ink shadow-sm transition hover:border-kiosk-accent/35 hover:bg-kiosk-layer disabled:pointer-events-none disabled:opacity-50 lg:rounded-xl lg:px-2.5 lg:py-2 lg:text-[10px]"
          >
            Start camera
          </button>
          <button
            type="button"
            onClick={captureFrame}
            disabled={!active}
            className="rounded-lg border border-kiosk-brand/30 bg-kiosk-primary px-2 py-1.5 text-[9px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50 lg:rounded-xl lg:px-2.5 lg:py-2 lg:text-[10px]"
          >
            Capture
          </button>
          <button
            type="button"
            onClick={stopTracks}
            disabled={!active}
            className="rounded-lg border border-kiosk-border bg-kiosk-layer px-2 py-1.5 text-[9px] font-semibold text-kiosk-ink shadow-sm transition hover:bg-white disabled:pointer-events-none disabled:opacity-45 lg:rounded-xl lg:px-2.5 lg:py-2 lg:text-[10px]"
          >
            Stop camera
          </button>
        </div>

        {previewDataUrl ? (
          <div className="flex shrink-0 flex-col gap-0.5">
            <span className="text-[8px] font-semibold uppercase tracking-wide text-kiosk-muted lg:text-[9px]">
              Captured
            </span>
            <div className="h-[4.5rem] w-[6rem] overflow-hidden rounded-lg border border-kiosk-success/35 bg-white shadow-sm sm:h-[5rem] sm:w-[6.75rem] lg:h-[5.5rem] lg:w-[7.25rem]">
              <img
                src={previewDataUrl}
                alt="Captured frame"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-[9px] font-medium text-kiosk-err lg:text-[10px]" role="alert">
          {error}
        </p>
      ) : null}

      <canvas ref={canvasRef} className="hidden" aria-hidden />
    </div>
  );
}
