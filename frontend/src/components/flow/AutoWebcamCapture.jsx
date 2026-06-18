import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCameraTryOrder,
  buildGetUserMediaVideoConstraints,
  ensureVideoInputLabels,
  enumerateVideoInputs,
  getUserMediaWithRetry,
  logActiveCameraFromStream,
  readSavedCameraDeviceId,
  writeSavedCameraDeviceId,
} from "../../utils/cameraDevices";

/** ~1s per beat so people can adjust; capture shortly after "1". */
const CAPTURE_DELAY_MS = 5200;
const COUNTDOWN_STEPS = [
  { at: 0, label: "5" },
  { at: 1000, label: "4" },
  { at: 2000, label: "3" },
  { at: 3000, label: "2" },
  { at: 4000, label: "1" },
];

const LOG_PREFIX = "[SmartMirror:Camera]";

/**
 * Full mirror-stage camera — fills the center column like the glass mirror, not a floating widget.
 * Dual-camera: enumerate devices, prefer external, fallback + reconnect on disconnect.
 */
export default function AutoWebcamCapture({ onComplete, onFatalError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const captureTimerRef = useRef(null);
  const countdownTimersRef = useRef([]);
  const scheduledRef = useRef(false);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onFatalErrorRef = useRef(onFatalError);
  const skipDeviceIdsRef = useRef(new Set());
  const trackEndedHandlerRef = useRef(null);
  const selectedDeviceIdRef = useRef(null);
  /** When selection or refresh changes, clear skip list; pure reconnect keeps skips. */
  const skipResetKeyRef = useRef(null);

  onCompleteRef.current = onComplete;
  onFatalErrorRef.current = onFatalError;

  const [phase, setPhase] = useState("starting");
  const [error, setError] = useState("");
  const [countdownLabel, setCountdownLabel] = useState("");
  const [videoDevices, setVideoDevices] = useState([]);
  /** null = Auto (external → integrated → other) */
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => readSavedCameraDeviceId());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [reconnectTick, setReconnectTick] = useState(0);
  const [cameraConnected, setCameraConnected] = useState(false);
  const [connectionHint, setConnectionHint] = useState("Connecting…");

  selectedDeviceIdRef.current = selectedDeviceId;

  const stopTracks = useCallback(() => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (countdownTimersRef.current.length > 0) {
      countdownTimersRef.current.forEach((id) => clearTimeout(id));
      countdownTimersRef.current = [];
    }
    const stream = streamRef.current;
    if (stream) {
      const vt = stream.getVideoTracks()[0];
      if (vt && trackEndedHandlerRef.current) {
        vt.removeEventListener("ended", trackEndedHandlerRef.current);
      }
      trackEndedHandlerRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const el = videoRef.current;
    if (el) el.srcObject = null;
    scheduledRef.current = false;
    setCameraConnected(false);
  }, []);

  const refreshCameraList = useCallback(async () => {
    try {
      const list = await enumerateVideoInputs();
      setVideoDevices(list);
      console.info(LOG_PREFIX, "enumerateDevices", { count: list.length, labels: list.map((d) => d.label || "(no label)") });
    } catch (e) {
      console.warn(LOG_PREFIX, "enumerateDevices failed", e);
    }
  }, []);

  useEffect(() => {
    refreshCameraList();
    const onDeviceChange = () => {
      console.info(LOG_PREFIX, "devicechange event");
      void refreshCameraList();
      const stream = streamRef.current;
      const track = stream?.getVideoTracks?.()[0];
      const id = track?.getSettings?.()?.deviceId;
      if (!id || completedRef.current) return;
      void enumerateVideoInputs().then((list) => {
        const stillThere = list.some((d) => d.deviceId === id);
        if (!stillThere) {
          console.warn(LOG_PREFIX, "active device removed from system", id);
          skipDeviceIdsRef.current.add(id);
          setConnectionHint("Reconnecting…");
          setReconnectTick((t) => t + 1);
        }
      });
    };
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    }
    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      }
    };
  }, [refreshCameraList]);

  useEffect(() => {
    completedRef.current = false;
    scheduledRef.current = false;
    let cancelled = false;

    const prevKey = skipResetKeyRef.current;
    const nextKey = { sel: selectedDeviceId, refn: refreshNonce };
    if (!prevKey || prevKey.sel !== nextKey.sel || prevKey.refn !== nextKey.refn) {
      skipDeviceIdsRef.current.clear();
      skipResetKeyRef.current = nextKey;
    }

    const fail = (msg) => {
      if (cancelled) return;
      setError(msg);
      setConnectionHint("No camera");
      onFatalErrorRef.current?.(msg);
      stopTracks();
    };

    const capture = () => {
      if (cancelled || completedRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !streamRef.current) {
        fail("Camera not ready.");
        return;
      }
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        fail("Camera not ready.");
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
          if (cancelled || !blob || completedRef.current) return;
          completedRef.current = true;
          setPhase("done");
          stopTracks();
          onCompleteRef.current?.({ dataUrl, blob });
        },
        "image/jpeg",
        0.92
      );
    };

    const scheduleCapture = () => {
      if (cancelled || completedRef.current || scheduledRef.current) return;
      scheduledRef.current = true;
      setPhase("capturing");
      setCountdownLabel(COUNTDOWN_STEPS[0].label);
      countdownTimersRef.current = COUNTDOWN_STEPS.slice(1).map(({ at, label }) =>
        setTimeout(() => {
          if (!cancelled && !completedRef.current) setCountdownLabel(label);
        }, at)
      );
      captureTimerRef.current = setTimeout(capture, CAPTURE_DELAY_MS);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        fail("Camera not supported in this browser.");
        return;
      }

      if (reconnectTick > 24) {
        console.error(LOG_PREFIX, "reconnect limit exceeded", { reconnectTick });
        fail("Camera connection failed repeatedly. Try Refresh cameras.");
        return;
      }

      setPhase("starting");
      setError("");
      setConnectionHint(skipDeviceIdsRef.current.size ? "Reconnecting…" : "Connecting…");

      try {
        await ensureVideoInputLabels();
      } catch (e) {
        console.warn(LOG_PREFIX, "ensureVideoInputLabels", e);
      }

      let inputs = await enumerateVideoInputs();
      setVideoDevices(inputs);

      let effectiveSelection = selectedDeviceIdRef.current;
      if (effectiveSelection && !inputs.some((d) => d.deviceId === effectiveSelection)) {
        console.warn(LOG_PREFIX, "saved selection no longer present, switching to Auto", effectiveSelection);
        writeSavedCameraDeviceId("");
        effectiveSelection = null;
        setSelectedDeviceId(null);
      }

      if (inputs.length === 0) {
        inputs = await enumerateVideoInputs();
        setVideoDevices(inputs);
      }
      if (inputs.length === 0) {
        fail("No camera available.");
        return;
      }

      let tryOrder = buildCameraTryOrder(inputs, effectiveSelection).filter(
        (id) => !skipDeviceIdsRef.current.has(id)
      );

      if (tryOrder.length === 0) {
        console.warn(LOG_PREFIX, "no devices left after skips, clearing skips and retrying once");
        skipDeviceIdsRef.current.clear();
        tryOrder = buildCameraTryOrder(inputs, effectiveSelection);
      }

      stopTracks();

      let stream = null;
      let lastErr = null;
      for (const deviceId of tryOrder) {
        if (cancelled || completedRef.current) return;
        try {
          const constraints = buildGetUserMediaVideoConstraints(deviceId);
          console.info(LOG_PREFIX, "opening stream", { deviceId: deviceId || "(default)" });
          stream = await getUserMediaWithRetry(constraints);
          break;
        } catch (e) {
          lastErr = e;
          const name = e?.name || "";
          console.warn(LOG_PREFIX, "open failed for device", deviceId, name);
          if (deviceId) skipDeviceIdsRef.current.add(deviceId);
          if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            fail("Camera permission denied.");
            return;
          }
        }
      }

      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (!stream) {
        const name = lastErr?.name || "";
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          fail("No camera found.");
        } else {
          fail("Could not start camera.");
        }
        return;
      }

      streamRef.current = stream;
      logActiveCameraFromStream(stream);

      const vt = stream.getVideoTracks()[0];
      if (vt) {
        const onEnded = () => {
          if (cancelled || completedRef.current) return;
          const settings = vt.getSettings?.() || {};
          const id = settings.deviceId;
          console.warn(LOG_PREFIX, "video track ended", { deviceId: id });
          if (id) skipDeviceIdsRef.current.add(id);
          setConnectionHint("Reconnecting…");
          setReconnectTick((t) => t + 1);
        };
        trackEndedHandlerRef.current = onEnded;
        vt.addEventListener("ended", onEnded);
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      setCameraConnected(true);
      setConnectionHint("Live · camera ready");
      setPhase("live");

      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        scheduleCapture();
      } else if (v) {
        v.addEventListener(
          "playing",
          () => {
            if (!cancelled && !completedRef.current) scheduleCapture();
          },
          { once: true }
        );
      }
    })();

    return () => {
      cancelled = true;
      stopTracks();
    };
  }, [selectedDeviceId, refreshNonce, reconnectTick, stopTracks]);

  const handleSelectCamera = useCallback((e) => {
    skipDeviceIdsRef.current.clear();
    const v = e.target.value;
    if (!v) {
      setSelectedDeviceId(null);
      writeSavedCameraDeviceId("");
      console.info(LOG_PREFIX, "user selected Auto camera priority");
    } else {
      setSelectedDeviceId(v);
      writeSavedCameraDeviceId(v);
      console.info(LOG_PREFIX, "user selected camera", v);
    }
  }, []);

  const handleRefreshCameras = useCallback(() => {
    skipDeviceIdsRef.current.clear();
    setRefreshNonce((n) => n + 1);
    console.info(LOG_PREFIX, "Refresh Cameras clicked");
    void refreshCameraList();
  }, [refreshCameraList]);

  return (
    <section className="kiosk-mirror-stage relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-kiosk-border bg-white shadow-kiosk-card lg:rounded-[1.5rem]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(37,99,235,0.06),transparent_55%)]"
        aria-hidden
      />

      <div className="absolute right-2 top-2 z-30 flex max-w-[min(42vw,11rem)] flex-col items-end gap-1 sm:right-3 sm:top-3 sm:max-w-[13rem]">
        <div className="flex items-center gap-1.5 rounded-md border border-kiosk-border bg-white px-2 py-1 text-[9px] text-kiosk-ink shadow-sm lg:text-[10px]">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              cameraConnected ? "bg-kiosk-success shadow-sm" : "bg-kiosk-warn"
            }`}
            aria-hidden
          />
          <span className="font-medium leading-tight">
            {cameraConnected ? "Live · camera ready" : connectionHint}
          </span>
        </div>
        <label className="sr-only" htmlFor="camera-source-select">
          Camera source
        </label>
        <select
          id="camera-source-select"
          value={selectedDeviceId ?? ""}
          onChange={handleSelectCamera}
          className="w-full max-w-full cursor-pointer rounded-md border border-kiosk-border bg-white px-1.5 py-1 text-[9px] font-medium text-kiosk-ink shadow-sm lg:text-[10px]"
        >
          <option value="">Auto (USB preferred)</option>
          {videoDevices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label?.trim() || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRefreshCameras}
          className="rounded-md border border-kiosk-border bg-kiosk-layer px-2 py-1 text-[9px] font-semibold text-kiosk-muted shadow-sm hover:bg-white hover:text-kiosk-ink lg:text-[10px]"
        >
          Refresh Cameras
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col p-2 sm:p-3 lg:p-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-stretch">
          <div className="mirror-frame-glow relative min-h-0 flex-1 rounded-[1.2rem] p-[2px] shadow-kiosk-float lg:rounded-[1.4rem]">
            <div className="relative h-full min-h-[min(48dvh,20rem)] w-full overflow-hidden rounded-[1.1rem] bg-kiosk-ink ring-1 ring-kiosk-border lg:min-h-0 lg:rounded-[1.25rem]">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                playsInline
                muted
                autoPlay
                aria-label="Mirror camera"
              />
              {(phase === "live" || phase === "capturing") && !error ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-kiosk-ink/85 via-transparent to-transparent pb-8 sm:pb-10 lg:justify-center lg:pb-0">
                  <div
                    className={`kiosk-cinematic-ring mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-2 border-white/50 text-2xl font-black text-white shadow-kiosk-float sm:h-24 sm:w-24 sm:text-3xl ${
                      phase === "capturing" ? "scale-100" : "scale-95"
                    }`}
                  >
                    {phase === "capturing" ? countdownLabel : "◉"}
                  </div>
                  <p className="rounded-full border border-white/40 bg-white/95 px-5 py-2.5 text-sm font-semibold tracking-wide text-kiosk-ink shadow-kiosk-card sm:px-6 sm:text-base">
                    {phase === "capturing"
                      ? countdownLabel === "1"
                        ? "Hold still — only you in frame while we capture"
                        : "Stay centered — ignore others and extra objects; one person only for the outfit overlay"
                      : "Step in alone — ask others to step aside and keep clutter out of view so we dress one person cleanly"}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-center text-xs font-medium text-kiosk-err" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-2 text-center text-xs font-medium text-kiosk-muted sm:text-sm">
            {phase === "starting" ? "Preparing the mirror camera…" : null}
            {phase === "live"
              ? "Tip: one clear person in frame — not two people or busy objects — helps the outfit sit correctly."
              : null}
            {phase === "capturing" ? "Automatic capture — no tap required; keep the mirror to a single person." : null}
            {phase === "done" ? "Captured — finishing your look…" : null}
          </p>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" aria-hidden />
    </section>
  );
}
