import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { postTryOn, getTryOnStatus } from "../api/tryonApi";
import { mapTryOnErrorToUserMessage } from "../lib/tryOnErrorMessages";
import { EXHIBITION_MODE, EXHIBITION_MODE_ENV } from "../lib/exhibitionMode";
import { buildFallbackTryOnBundle } from "../lib/fallbackTryOnEngine";
import { useCatalog } from "../catalog/CatalogContext";
import { TAB_ALL } from "../catalog/catalogFilters";
import Sidebar from "../components/layout/Sidebar";
import TopHeader from "../components/layout/TopHeader";
import CatalogPanel from "../components/catalog/CatalogPanel";
import KioskActionDock from "../components/kiosk/KioskActionDock";
import FlowGenderStep from "../components/flow/FlowGenderStep";
import FlowBrowseHint from "../components/flow/FlowBrowseHint";
import FlowPreviewStep from "../components/flow/FlowPreviewStep";
import AutoWebcamCapture from "../components/flow/AutoWebcamCapture";
import FlowResultStep from "../components/flow/FlowResultStep";
import { useExhibitionGuidance } from "../hooks/useExhibitionGuidance";
import {
  cleanupExpiredLocks,
  cleanupOldPredictionRefs,
  isValidTryOnOutput,
  recordPredictionActivity,
  resetTryOnFinalImageLocks,
  tryLockTryOnFinalImage,
} from "../lib/tryOnExhibitionGuards";

/** @typedef {"gender"|"browse"|"preview"|"camera"|"result"} FlowStep */

function pickTabForIdea(label, tabs) {
  const l = String(label).toLowerCase();
  const match = (re) => tabs.find((t) => re.test(t.label))?.id;
  if (/evening/i.test(l)) {
    return match(/dress|traditional|outerwear|evening/i) ?? TAB_ALL;
  }
  if (/office/i.test(l)) {
    return match(/shirt|skirt|outerwear|bottom/i) ?? TAB_ALL;
  }
  if (/weekend|casual/i.test(l)) {
    return match(/shirt|bottom|hoodie|skirt/i) ?? TAB_ALL;
  }
  return TAB_ALL;
}

function normalizeTryOnResponse(raw) {
  if (!raw || typeof raw !== "object") return null;
  const preview = raw.previewImage != null && String(raw.previewImage).trim() !== "" ? String(raw.previewImage) : null;
  const processedRaw = raw.processedImage != null ? String(raw.processedImage).trim() : "";
  const processedImage = processedRaw || preview || null;
  return {
    clothId: raw.clothId ?? null,
    status: raw.status ?? null,
    originalImage: raw.originalImage ?? null,
    processedImage,
    previewImage: preview,
  };
}

const UI_DELAYED_STARTING_MS = 90000;
const MAX_POLLING_MS = 10 * 60 * 1000;
/** Exhibition: illusion fallback only after this many ms in Replicate starting/processing (env override). */
const FALLBACK_TRIGGER_MS = Number(import.meta.env?.VITE_TRYON_FALLBACK_MS) || 60000;

function getExponentialPollDelayMs(pollIndex) {
  return Math.min(10000, 1000 * Math.pow(2, Math.min(pollIndex, 4)));
}

function normalizeReplicateStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "starting" || s === "processing" || s === "succeeded" || s === "failed") return s;
  if (s === "canceled") return "failed";
  return "starting";
}

function deriveUiStatus(status, elapsedMs = 0) {
  if (String(status || "").toLowerCase() === "instant_preview") return "success";
  const normalized = normalizeReplicateStatus(status);
  if (normalized === "succeeded") return "success";
  if (normalized === "failed") return "error";
  if (normalized === "processing") return "generating";
  if (elapsedMs > UI_DELAYED_STARTING_MS) return "delayed";
  return "waiting";
}

function createRealFailureError(snapshot) {
  const err = new Error(snapshot?.message || "Replicate try-on failed");
  err.response = { status: 502, data: { message: snapshot?.message || "Replicate try-on failed" } };
  return err;
}

function isCancelError(err) {
  return err?.name === "CanceledError" || err?.code === "ERR_CANCELED" || err?.name === "AbortError";
}

export default function Home() {
  const { gender, selectedCloth, setGender, setSelectedCloth, setActiveTabId, tabs, items } = useCatalog();

  /** @type {[FlowStep, import("react").Dispatch<import("react").SetStateAction<FlowStep>>]} */
  const [step, setStep] = useState("gender");
  const viewMode = "Real-time";
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [tryOnStatus, setTryOnStatus] = useState("waiting");
  const [tryOnNotice, setTryOnNotice] = useState("");
  const [fallbackMode, setFallbackMode] = useState(false);
  const [webcamCapture, setWebcamCapture] = useState(null);
  const [cameraSession, setCameraSession] = useState(0);
  const [navSelection, setNavSelection] = useState("home");
  const [liveOn, setLiveOn] = useState(true);
  const [aiOn, setAiOn] = useState(true);

  const exhibitionHints = useExhibitionGuidance(step, selectedCloth);
  const idleMirrorPresence = step === "browse" && !loading;

  /** Prevents double camera hand-off / duplicate try-on POST if complete fires twice. */
  const cameraTryOnLockRef = useRef(false);
  /** Synchronous guard: blocks overlapping try-on before React applies `loading`. */
  const tryOnInFlightRef = useRef(false);
  /** Brief lock after opening camera from preview (rapid double-tap). */
  const cameraOpenLockRef = useRef(false);
  /** Debounce idea chips in the dock (exhibition hammer taps). */
  const lastIdeaPickMsRef = useRef(0);
  const flipLockRef = useRef(false);
  const stylistPickLockRef = useRef(false);
  const tryOnPollAbortRef = useRef(null);
  const tryOnSessionRef = useRef(0);
  const lastSuccessTryOnRef = useRef(null);
  const fallbackFiredForSessionRef = useRef(false);
  /** Tracks async Replicate job so we can recover the final image if the main poll loop stops early. */
  const activeAsyncTryOnRef = useRef(null);
  const recoveryAbortRef = useRef(null);
  const lastPollProcessedUrlRef = useRef(null);
  const hadSecureInstantPreviewRef = useRef(false);

  const [fallbackCards, setFallbackCards] = useState([]);
  const [highlightRealResult, setHighlightRealResult] = useState(false);
  const [replicatePending, setReplicatePending] = useState(false);
  /** Exhibition debug: brief “RECOVERED” after async result lands post-fallback. */
  const [recoverPulse, setRecoverPulse] = useState(false);
  const [aiRevealNonce, setAiRevealNonce] = useState(0);
  /** Current async Replicate job id — drives reveal binding and FlowResultStep isolation. */
  const [tryOnActivePredictionId, setTryOnActivePredictionId] = useState("");
  /** Bumps when a new try-on session starts so the result mirror remounts (no leaked animation). */
  const [tryOnFlowEpoch, setTryOnFlowEpoch] = useState(0);

  /** Synchronous mirror of `tryOnActivePredictionId` — authoritative gate for async handlers. */
  const tryOnActivePredictionIdRef = useRef("");
  /** Prediction id bound to the current main poll AbortController (cleared in `finally`). */
  const tryOnPollPredictionIdRef = useRef("");

  const syncActivePredictionId = useCallback((next) => {
    const v = next == null || next === "" ? "" : String(next).trim();
    tryOnActivePredictionIdRef.current = v;
    if (v) recordPredictionActivity(v);
    setTryOnActivePredictionId(v);
  }, []);

  const dropStalePrediction = useCallback((predictionId) => {
    const incoming = String(predictionId || "").trim();
    const active = String(tryOnActivePredictionIdRef.current || "").trim();
    if (incoming !== active) {
      console.log("[TRYON DROP] stale prediction ignored:", incoming, "active:", active || "(none)");
      return true;
    }
    return false;
  }, []);

  const stopRecoveryPolling = useCallback(() => {
    if (recoveryAbortRef.current) {
      recoveryAbortRef.current.abort();
      recoveryAbortRef.current = null;
    }
  }, []);

  const prevExhibitionEnvRef = useRef(null);
  useEffect(() => {
    if (prevExhibitionEnvRef.current === null) {
      prevExhibitionEnvRef.current = EXHIBITION_MODE_ENV;
      return;
    }
    if (prevExhibitionEnvRef.current === EXHIBITION_MODE_ENV) return;
    prevExhibitionEnvRef.current = EXHIBITION_MODE_ENV;
    setLoading(false);
    tryOnInFlightRef.current = false;
    cameraTryOnLockRef.current = false;
    if (tryOnPollAbortRef.current) {
      tryOnPollAbortRef.current.abort();
      tryOnPollAbortRef.current = null;
    }
    stopRecoveryPolling();
    setReplicatePending(false);
    activeAsyncTryOnRef.current = null;
    resetTryOnFinalImageLocks();
    lastPollProcessedUrlRef.current = null;
    hadSecureInstantPreviewRef.current = false;
    setAiRevealNonce(0);
    syncActivePredictionId("");
    tryOnPollPredictionIdRef.current = "";
    setTryOnFlowEpoch((e) => e + 1);
    setResult(null);
    setError("");
    setTryOnStatus("waiting");
    setTryOnNotice("");
    setFallbackMode(false);
    setFallbackCards([]);
    setHighlightRealResult(false);
    fallbackFiredForSessionRef.current = false;
  }, [EXHIBITION_MODE_ENV, stopRecoveryPolling, syncActivePredictionId]);

  const startBackgroundRecoveryPolling = useCallback(
    ({ predictionId, sessionId, clothId, originalImage, startedAt }) => {
      if (!EXHIBITION_MODE || !predictionId) return;
      if (tryOnSessionRef.current !== sessionId) return;
      if (recoveryAbortRef.current && !recoveryAbortRef.current.signal.aborted) return;
      if (dropStalePrediction(predictionId)) return;

      stopRecoveryPolling();
      const controller = new AbortController();
      recoveryAbortRef.current = controller;

      const run = async () => {
        try {
          let recoveryDelayIdx = 0;
          for (;;) {
            if (controller.signal.aborted || tryOnSessionRef.current !== sessionId) return;
            await new Promise((resolve) => {
              const delayMs = getExponentialPollDelayMs(recoveryDelayIdx);
              const t = window.setTimeout(resolve, delayMs);
              controller.signal.addEventListener(
                "abort",
                () => {
                  window.clearTimeout(t);
                  resolve();
                },
                { once: true }
              );
            });
            recoveryDelayIdx += 1;
            if (controller.signal.aborted || tryOnSessionRef.current !== sessionId) return;
            try {
              const polled = await getTryOnStatus(predictionId, {
                signal: controller.signal,
                startedAt,
              });
              if (controller.signal.aborted || tryOnSessionRef.current !== sessionId) return;
              const status = normalizeReplicateStatus(polled?.status);
              if (status === "succeeded" && polled?.processedImage) {
                if (!isValidTryOnOutput(polled.processedImage)) {
                  continue;
                }
                if (dropStalePrediction(predictionId)) {
                  stopRecoveryPolling();
                  return;
                }
                if (polled.processedImage === lastPollProcessedUrlRef.current) {
                  continue;
                }
                if (!tryLockTryOnFinalImage(predictionId)) {
                  setReplicatePending(false);
                  activeAsyncTryOnRef.current = null;
                  stopRecoveryPolling();
                  return;
                }
                const usedInstantPreview = activeAsyncTryOnRef.current?.usedInstantPreview;
                if (fallbackFiredForSessionRef.current) {
                  setHighlightRealResult(true);
                  window.setTimeout(() => setHighlightRealResult(false), 2200);
                  setRecoverPulse(true);
                  window.setTimeout(() => setRecoverPulse(false), 2800);
                } else if (usedInstantPreview) {
                  setHighlightRealResult(true);
                  window.setTimeout(() => setHighlightRealResult(false), 2200);
                }
                if (usedInstantPreview) {
                  setAiRevealNonce((n) => n + 1);
                }
                lastPollProcessedUrlRef.current = polled.processedImage;
                fallbackFiredForSessionRef.current = false;
                setFallbackMode(false);
                setFallbackCards([]);
                setReplicatePending(false);
                activeAsyncTryOnRef.current = null;
                stopRecoveryPolling();
                setResult((prev) =>
                  normalizeTryOnResponse({
                    clothId,
                    status: "success",
                    originalImage,
                    processedImage: polled.processedImage,
                    previewImage: prev?.previewImage ?? undefined,
                  })
                );
                setTryOnStatus("success");
                setTryOnNotice("");
                lastSuccessTryOnRef.current = polled.processedImage;
                return;
              }
            } catch {
              return;
            }
          }
        } finally {
          if (recoveryAbortRef.current === controller) {
            recoveryAbortRef.current = null;
          }
        }
      };
      void run();
    },
    [stopRecoveryPolling, dropStalePrediction]
  );

  useEffect(() => {
    return () => {
      if (tryOnPollAbortRef.current) {
        tryOnPollAbortRef.current.abort();
        tryOnPollAbortRef.current = null;
      }
      if (recoveryAbortRef.current) {
        recoveryAbortRef.current.abort();
        recoveryAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!gender && step !== "gender") {
      setStep("gender");
    }
  }, [gender, step]);

  useEffect(() => {
    if (step === "preview" && !selectedCloth) {
      setStep("browse");
    }
  }, [step, selectedCloth]);

  useEffect(() => {
    if (step === "preview" || step === "camera" || step === "result") {
      setNavSelection("tryOn");
    }
  }, [step]);

  useEffect(() => {
    setError("");
    setResult(null);
    setTryOnStatus("waiting");
    setTryOnNotice("");
    setFallbackMode(false);
    setFallbackCards([]);
    setHighlightRealResult(false);
    setReplicatePending(false);
    setAiRevealNonce(0);
    syncActivePredictionId("");
    tryOnPollPredictionIdRef.current = "";
    setTryOnFlowEpoch((e) => e + 1);
    resetTryOnFinalImageLocks();
    lastPollProcessedUrlRef.current = null;
    hadSecureInstantPreviewRef.current = false;
    fallbackFiredForSessionRef.current = false;
    activeAsyncTryOnRef.current = null;
    if (tryOnPollAbortRef.current) {
      tryOnPollAbortRef.current.abort();
      tryOnPollAbortRef.current = null;
    }
    if (recoveryAbortRef.current) {
      recoveryAbortRef.current.abort();
      recoveryAbortRef.current = null;
    }
  }, [selectedCloth, syncActivePredictionId]);

  const runTryOnRequest = useCallback(
    async (captureOverride = null) => {
      if (tryOnInFlightRef.current) return false;

      const clothId = selectedCloth?._id ?? selectedCloth?.id ?? null;
      if (clothId == null || clothId === "") {
        setError("Choose a look on the rail first — then you can try it on.");
        return false;
      }

      const cap = captureOverride ?? webcamCapture;

      let pollController = null;
      let asyncPredictionIdForSession = "";
      tryOnInFlightRef.current = true;
      try {
        tryOnSessionRef.current += 1;
        const sessionId = tryOnSessionRef.current;
        if (tryOnPollAbortRef.current) {
          tryOnPollAbortRef.current.abort();
        }
        stopRecoveryPolling();
        pollController = new AbortController();
        tryOnPollAbortRef.current = pollController;
        /* New AbortController per try-on session; previous loop is aborted above. tryOnPollPredictionIdRef binds UI gates to this job once predictionId exists. */
        resetTryOnFinalImageLocks();
        lastPollProcessedUrlRef.current = null;
        hadSecureInstantPreviewRef.current = false;
        fallbackFiredForSessionRef.current = false;
        setFallbackCards([]);
        setHighlightRealResult(false);
        activeAsyncTryOnRef.current = null;
        setReplicatePending(false);

        asyncPredictionIdForSession = "";
        tryOnPollPredictionIdRef.current = "";
        setAiRevealNonce(0);
        syncActivePredictionId("");
        setTryOnFlowEpoch((e) => e + 1);
        setLoading(EXHIBITION_MODE ? false : true);
        setError("");
        setTryOnStatus("waiting");
        setTryOnNotice("");
        setFallbackMode(false);
        const bridgePerson = cap?.dataUrl ?? selectedCloth?.imageUrl ?? selectedCloth?.image ?? null;
        setResult(null);
        setResult(
          normalizeTryOnResponse({
            clothId,
            status: "waiting",
            originalImage: bridgePerson,
            processedImage: EXHIBITION_MODE && bridgePerson ? bridgePerson : null,
          })
        );

        const data = await postTryOn(
          {
            clothId,
            gender: selectedCloth?.gender || gender || "men",
            category: selectedCloth?.category || "",
            mode: viewMode,
            ...(cap?.dataUrl ? { webcamImage: cap.dataUrl } : {}),
          },
          { signal: pollController.signal }
        );

        if (!data?.predictionId) {
          asyncPredictionIdForSession = "";
          tryOnPollPredictionIdRef.current = "";
          syncActivePredictionId("");
          setResult(normalizeTryOnResponse(data));
          setTryOnStatus("success");
          setReplicatePending(false);
          activeAsyncTryOnRef.current = null;
          stopRecoveryPolling();
          if (data?.processedImage && typeof data.processedImage === "string") {
            lastSuccessTryOnRef.current = data.processedImage;
          }
          return true;
        }

        const previewStr = String(data.previewImage || data.processedImage || "").trim();
        const silentIllusionPoll =
          EXHIBITION_MODE &&
          (String(data?.status || "").toLowerCase() === "instant_preview" ||
            (!!previewStr && /^data:image\//i.test(previewStr)));

        asyncPredictionIdForSession = String(data.predictionId);
        tryOnPollPredictionIdRef.current = asyncPredictionIdForSession;
        syncActivePredictionId(asyncPredictionIdForSession);
        setReplicatePending(true);
        activeAsyncTryOnRef.current = {
          predictionId: asyncPredictionIdForSession,
          startedAt: data?.startedAt,
          sessionId,
          clothId,
          originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
          usedInstantPreview: Boolean(silentIllusionPoll && previewStr),
        };

        if (silentIllusionPoll && previewStr) {
          setLoading(false);
          setTryOnStatus("success");
          hadSecureInstantPreviewRef.current = true;
          setResult(
            normalizeTryOnResponse({
              clothId,
              status: "instant_preview",
              originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
              processedImage: previewStr,
              previewImage: data.previewImage || previewStr,
            })
          );
        } else {
          const kickoffStatus = deriveUiStatus(data?.status, 0);
          hadSecureInstantPreviewRef.current = false;
          setTryOnStatus(kickoffStatus);
          setResult(
            normalizeTryOnResponse({
              clothId,
              status: data?.status || "waiting",
              originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
              processedImage: data.processedImage ?? null,
              previewImage: data.previewImage ?? null,
            })
          );
        }

        const predictionId = asyncPredictionIdForSession;
        const pollStartedAt = Date.now();
        let rawStatus = normalizeReplicateStatus(data?.status);
        let pollIdx = 0;
        while (!pollController.signal.aborted) {
          await new Promise((resolve) => {
            const delayMs = getExponentialPollDelayMs(pollIdx);
            const t = window.setTimeout(resolve, delayMs);
            pollController.signal.addEventListener(
              "abort",
              () => {
                window.clearTimeout(t);
                resolve();
              },
              { once: true }
            );
          });
          if (pollController.signal.aborted || tryOnSessionRef.current !== sessionId) {
            if (tryOnSessionRef.current !== sessionId) return false;
            if (
              pollController.signal.aborted &&
              EXHIBITION_MODE &&
              activeAsyncTryOnRef.current?.predictionId === predictionId &&
              activeAsyncTryOnRef.current?.sessionId === sessionId &&
              !dropStalePrediction(predictionId)
            ) {
              startBackgroundRecoveryPolling({
                predictionId,
                sessionId,
                clothId,
                originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                startedAt: data?.startedAt,
              });
              return true;
            }
            return false;
          }
          const elapsedMs = Date.now() - pollStartedAt;

          if (
            EXHIBITION_MODE &&
            !hadSecureInstantPreviewRef.current &&
            !silentIllusionPoll &&
            !fallbackFiredForSessionRef.current &&
            elapsedMs >= FALLBACK_TRIGGER_MS &&
            (rawStatus === "starting" || rawStatus === "processing")
          ) {
            if (dropStalePrediction(predictionId)) return false;
            fallbackFiredForSessionRef.current = true;
            const bundle = buildFallbackTryOnBundle({
              userImageUrl: cap?.dataUrl ?? null,
              garmentImageUrl: selectedCloth?.imageUrl ?? selectedCloth?.image ?? null,
              catalogItems: items,
              lastSuccessProcessedUrl: lastSuccessTryOnRef.current,
              clothId,
              clothName: selectedCloth?.name ?? null,
              category: selectedCloth?.category ?? null,
            });
            setFallbackCards(bundle.cards);
            setFallbackMode(true);
            setLoading(false);
            setTryOnNotice("");
            setResult(
              normalizeTryOnResponse({
                clothId,
                status: "fallback",
                originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                processedImage: bundle.heroPreviewUrl,
              })
            );
            if (!dropStalePrediction(predictionId)) {
              startBackgroundRecoveryPolling({
                predictionId,
                sessionId,
                clothId,
                originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                startedAt: data?.startedAt,
              });
            }
          }

          if (elapsedMs > MAX_POLLING_MS) {
            if (EXHIBITION_MODE && silentIllusionPoll) {
              if (dropStalePrediction(predictionId)) return true;
              setLoading(false);
              setTryOnNotice("");
              startBackgroundRecoveryPolling({
                predictionId,
                sessionId,
                clothId,
                originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                startedAt: data?.startedAt,
              });
              return true;
            }
            if (EXHIBITION_MODE) {
              if (dropStalePrediction(predictionId)) return true;
              setLoading(false);
              setFallbackMode(true);
              setTryOnNotice("");
              if (!fallbackFiredForSessionRef.current && !hadSecureInstantPreviewRef.current) {
                fallbackFiredForSessionRef.current = true;
                const bundle = buildFallbackTryOnBundle({
                  userImageUrl: cap?.dataUrl ?? null,
                  garmentImageUrl: selectedCloth?.imageUrl ?? selectedCloth?.image ?? null,
                  catalogItems: items,
                  lastSuccessProcessedUrl: lastSuccessTryOnRef.current,
                  clothId,
                  clothName: selectedCloth?.name ?? null,
                  category: selectedCloth?.category ?? null,
                });
                setFallbackCards(bundle.cards);
                setResult(
                  normalizeTryOnResponse({
                    clothId,
                    status: "fallback",
                    originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                    processedImage: bundle.heroPreviewUrl,
                  })
                );
              }
              if (!dropStalePrediction(predictionId)) {
                startBackgroundRecoveryPolling({
                  predictionId,
                  sessionId,
                  clothId,
                  originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                  startedAt: data?.startedAt,
                });
              }
            } else {
              setLoading(false);
              setTryOnNotice("Still working in background, you can retry or wait.");
            }
            return true;
          }

          const polled = await getTryOnStatus(predictionId, {
            signal: pollController.signal,
            startedAt: data?.startedAt,
          });
          if (pollController.signal.aborted || tryOnSessionRef.current !== sessionId) {
            if (tryOnSessionRef.current !== sessionId) return false;
            if (
              pollController.signal.aborted &&
              EXHIBITION_MODE &&
              activeAsyncTryOnRef.current?.predictionId === predictionId &&
              activeAsyncTryOnRef.current?.sessionId === sessionId &&
              !dropStalePrediction(predictionId)
            ) {
              startBackgroundRecoveryPolling({
                predictionId,
                sessionId,
                clothId,
                originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                startedAt: data?.startedAt,
              });
              return true;
            }
            return false;
          }
          if (dropStalePrediction(predictionId)) return false;
          rawStatus = normalizeReplicateStatus(polled?.status);
          const polledStatus = deriveUiStatus(rawStatus, elapsedMs);
          if (!silentIllusionPoll || rawStatus === "succeeded" || rawStatus === "failed") {
            setTryOnStatus(polledStatus);
          }
          pollIdx += 1;
          if (polledStatus === "success") {
            if (!isValidTryOnOutput(polled?.processedImage)) {
              continue;
            }
            if (polled.processedImage === lastPollProcessedUrlRef.current) {
              continue;
            }
            if (previewStr && polled.processedImage === previewStr) {
              continue;
            }
            if (dropStalePrediction(predictionId)) return false;
            if (!tryLockTryOnFinalImage(predictionId)) {
              setReplicatePending(false);
              activeAsyncTryOnRef.current = null;
              stopRecoveryPolling();
              return true;
            }
            lastPollProcessedUrlRef.current = polled.processedImage;

            const wasFallbackSession = fallbackFiredForSessionRef.current;
            const usedInstantPreview = activeAsyncTryOnRef.current?.usedInstantPreview;
            if (EXHIBITION_MODE && (wasFallbackSession || usedInstantPreview)) {
              setHighlightRealResult(true);
              window.setTimeout(() => setHighlightRealResult(false), 2200);
            }
            if (EXHIBITION_MODE && wasFallbackSession) {
              setRecoverPulse(true);
              window.setTimeout(() => setRecoverPulse(false), 2800);
            }
            if (usedInstantPreview) {
              setAiRevealNonce((n) => n + 1);
            }
            fallbackFiredForSessionRef.current = false;
            setFallbackMode(false);
            setFallbackCards([]);
            setReplicatePending(false);
            activeAsyncTryOnRef.current = null;
            stopRecoveryPolling();
            setResult((prev) =>
              normalizeTryOnResponse({
                clothId,
                status: "success",
                originalImage: cap?.dataUrl ?? data?.originalImage ?? null,
                processedImage: polled.processedImage,
                previewImage: prev?.previewImage ?? data?.previewImage ?? previewStr ?? undefined,
              })
            );
            lastSuccessTryOnRef.current = polled.processedImage;
            setTryOnStatus("success");
            return true;
          }
          if (polledStatus === "error") {
            throw createRealFailureError({ message: polled?.error || "Replicate try-on failed" });
          }
        }
        return true;
      } catch (err) {
        if (isCancelError(err)) return false;
        if (tryOnSessionRef.current !== sessionId) return false;
        if (asyncPredictionIdForSession && dropStalePrediction(asyncPredictionIdForSession)) {
          setReplicatePending(false);
          activeAsyncTryOnRef.current = null;
          stopRecoveryPolling();
          return true;
        }
        if (EXHIBITION_MODE) {
          if (hadSecureInstantPreviewRef.current) {
            setReplicatePending(false);
            setTryOnStatus("success");
            setTryOnNotice("");
            setError("");
            return true;
          }
          const bundle = buildFallbackTryOnBundle({
            userImageUrl: cap?.dataUrl ?? null,
            garmentImageUrl: selectedCloth?.imageUrl ?? selectedCloth?.image ?? null,
            catalogItems: items,
            lastSuccessProcessedUrl: lastSuccessTryOnRef.current,
            clothId,
            clothName: selectedCloth?.name ?? null,
            category: selectedCloth?.category ?? null,
          });
          fallbackFiredForSessionRef.current = true;
          setFallbackCards(bundle.cards);
          setFallbackMode(true);
          setTryOnStatus("delayed");
          setTryOnNotice("");
          setError("");
          setReplicatePending(false);
          activeAsyncTryOnRef.current = null;
          stopRecoveryPolling();
          setResult(
            normalizeTryOnResponse({
              clothId,
              status: "fallback",
              originalImage: cap?.dataUrl ?? null,
              processedImage: bundle.heroPreviewUrl,
            })
          );
          return true;
        }
        setTryOnStatus("error");
        setResult(null);
        setError(mapTryOnErrorToUserMessage(err));
        return false;
      } finally {
        tryOnPollPredictionIdRef.current = "";
        setLoading(false);
        tryOnInFlightRef.current = false;
        if (pollController && tryOnPollAbortRef.current === pollController) {
          tryOnPollAbortRef.current.abort();
          tryOnPollAbortRef.current = null;
        }
      }
    },
    [
      selectedCloth,
      gender,
      webcamCapture,
      items,
      startBackgroundRecoveryPolling,
      stopRecoveryPolling,
      syncActivePredictionId,
      dropStalePrediction,
    ]
  );

  useEffect(() => {
    if (!EXHIBITION_MODE) return undefined;
    const id = window.setInterval(() => {
      cleanupExpiredLocks(40 * 60 * 1000);
      cleanupOldPredictionRefs(40 * 60 * 1000);
    }, 300000);
    return () => window.clearInterval(id);
  }, []);

  const handleSidebarNav = useCallback(
    (id) => {
      setLoading(false);
      tryOnInFlightRef.current = false;
      cameraTryOnLockRef.current = false;
      if (tryOnPollAbortRef.current) {
        tryOnPollAbortRef.current.abort();
        tryOnPollAbortRef.current = null;
      }
      stopRecoveryPolling();
      setReplicatePending(false);
      activeAsyncTryOnRef.current = null;
      setNavSelection(id);
      if (id === "home") {
        setResult(null);
        setError("");
        setWebcamCapture(null);
        setSelectedCloth(null);
        setStep("browse");
        return;
      }
      if (id === "tryOn") {
        if (selectedCloth) setStep("preview");
        else setStep("browse");
        return;
      }
      if (id === "looks") {
        setActiveTabId(TAB_ALL);
        setStep("browse");
        return;
      }
      if (id === "help") {
        setStep("browse");
      }
    },
    [selectedCloth, setSelectedCloth, setActiveTabId]
  );

  const handleIdeaPick = useCallback(
    (label) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - lastIdeaPickMsRef.current < 220) return;
      lastIdeaPickMsRef.current = now;
      setActiveTabId(pickTabForIdea(label, tabs));
      setNavSelection("looks");
    },
    [tabs, setActiveTabId]
  );

  const handleFlip = useCallback(() => {
    if ((loading && !result?.processedImage) || flipLockRef.current) return;
    flipLockRef.current = true;
    window.setTimeout(() => {
      flipLockRef.current = false;
    }, 280);
    setResult((r) => {
      if (!r) return r;
      const a = r.originalImage;
      const b = r.processedImage;
      if (a == null && b == null) return r;
      return { ...r, originalImage: b, processedImage: a };
    });
  }, [loading, result?.processedImage]);

  const canFlip =
    !!result && (result.originalImage != null || result.processedImage != null);

  const onFlowItemSelect = useCallback(() => {
    setNavSelection("tryOn");
    setStep("preview");
  }, []);

  const handleStylistTryOutfit = useCallback(
    (item) => {
      if (!item) return;
      if (stylistPickLockRef.current) return;
      stylistPickLockRef.current = true;
      window.setTimeout(() => {
        stylistPickLockRef.current = false;
      }, 400);
      setLoading(false);
      tryOnInFlightRef.current = false;
      cameraTryOnLockRef.current = false;
      if (tryOnPollAbortRef.current) {
        tryOnPollAbortRef.current.abort();
        tryOnPollAbortRef.current = null;
      }
      stopRecoveryPolling();
      setReplicatePending(false);
      activeAsyncTryOnRef.current = null;
      setSelectedCloth(item);
      setResult(null);
      setError("");
      setWebcamCapture(null);
      setNavSelection("tryOn");
      setStep("preview");
    },
    [setSelectedCloth]
  );

  const onPreviewTryOn = useCallback(() => {
    if (cameraOpenLockRef.current) return;
    cameraOpenLockRef.current = true;
    window.setTimeout(() => {
      cameraOpenLockRef.current = false;
    }, 650);
    setLoading(false);
    tryOnInFlightRef.current = false;
    cameraTryOnLockRef.current = false;
    if (tryOnPollAbortRef.current) {
      tryOnPollAbortRef.current.abort();
      tryOnPollAbortRef.current = null;
    }
    stopRecoveryPolling();
    setReplicatePending(false);
    activeAsyncTryOnRef.current = null;
    setError("");
    setResult(null);
    setWebcamCapture(null);
    setCameraSession((k) => k + 1);
    setStep("camera");
  }, [syncActivePredictionId]);

  const onPreviewChooseAnother = useCallback(() => {
    setLoading(false);
    tryOnInFlightRef.current = false;
    cameraTryOnLockRef.current = false;
    if (tryOnPollAbortRef.current) {
      tryOnPollAbortRef.current.abort();
      tryOnPollAbortRef.current = null;
    }
    stopRecoveryPolling();
    setReplicatePending(false);
    activeAsyncTryOnRef.current = null;
    resetTryOnFinalImageLocks();
    lastPollProcessedUrlRef.current = null;
    setAiRevealNonce(0);
    syncActivePredictionId("");
    tryOnPollPredictionIdRef.current = "";
    setSelectedCloth(null);
    setNavSelection("home");
    setStep("browse");
  }, [setSelectedCloth, syncActivePredictionId]);

  const onCameraComplete = useCallback(
    async (payload) => {
      if (cameraTryOnLockRef.current) return;
      cameraTryOnLockRef.current = true;
      resetTryOnFinalImageLocks();
      lastPollProcessedUrlRef.current = null;
      setAiRevealNonce(0);
      syncActivePredictionId("");
      tryOnPollPredictionIdRef.current = "";
      setWebcamCapture(payload);
      setResult(null);
      setError("");
      setStep("result");
      try {
        const ok = await runTryOnRequest(payload);
        if (!ok) {
          if (EXHIBITION_MODE && activeAsyncTryOnRef.current?.predictionId) {
            /* Stay on result: background recovery is still polling Replicate for the real image. */
          } else {
            setStep("preview");
          }
        }
      } catch (err) {
        console.error("[SmartMirror] try-on after capture failed", err);
        if (!EXHIBITION_MODE) {
          setError(mapTryOnErrorToUserMessage(err));
          setStep("preview");
        }
      } finally {
        cameraTryOnLockRef.current = false;
      }
    },
    [runTryOnRequest, syncActivePredictionId]
  );

  const onCameraFatal = useCallback((msg) => {
    cameraTryOnLockRef.current = false;
    tryOnInFlightRef.current = false;
    if (tryOnPollAbortRef.current) {
      tryOnPollAbortRef.current.abort();
      tryOnPollAbortRef.current = null;
    }
    stopRecoveryPolling();
    setReplicatePending(false);
    activeAsyncTryOnRef.current = null;
    resetTryOnFinalImageLocks();
    lastPollProcessedUrlRef.current = null;
    setAiRevealNonce(0);
    syncActivePredictionId("");
    tryOnPollPredictionIdRef.current = "";
    setTryOnFlowEpoch((e) => e + 1);
    setLoading(false);
    setError(msg || "Camera error.");
    setStep("preview");
  }, [syncActivePredictionId]);

  const onResultRetryCamera = useCallback(() => {
    if (cameraOpenLockRef.current) return;
    cameraOpenLockRef.current = true;
    window.setTimeout(() => {
      cameraOpenLockRef.current = false;
    }, 650);
    setLoading(false);
    tryOnInFlightRef.current = false;
    cameraTryOnLockRef.current = false;
    if (tryOnPollAbortRef.current) {
      tryOnPollAbortRef.current.abort();
      tryOnPollAbortRef.current = null;
    }
    stopRecoveryPolling();
    setReplicatePending(false);
    activeAsyncTryOnRef.current = null;
    resetTryOnFinalImageLocks();
    lastPollProcessedUrlRef.current = null;
    setAiRevealNonce(0);
    syncActivePredictionId("");
    tryOnPollPredictionIdRef.current = "";
    setTryOnFlowEpoch((e) => e + 1);
    setResult(null);
    setError("");
    setWebcamCapture(null);
    setCameraSession((k) => k + 1);
    setStep("camera");
  }, [syncActivePredictionId]);

  const onResultNewOutfit = useCallback(() => {
    setLoading(false);
    tryOnInFlightRef.current = false;
    cameraTryOnLockRef.current = false;
    if (tryOnPollAbortRef.current) {
      tryOnPollAbortRef.current.abort();
      tryOnPollAbortRef.current = null;
    }
    stopRecoveryPolling();
    setReplicatePending(false);
    activeAsyncTryOnRef.current = null;
    resetTryOnFinalImageLocks();
    lastPollProcessedUrlRef.current = null;
    setAiRevealNonce(0);
    syncActivePredictionId("");
    tryOnPollPredictionIdRef.current = "";
    setTryOnFlowEpoch((e) => e + 1);
    setSelectedCloth(null);
    setResult(null);
    setWebcamCapture(null);
    setError("");
    setNavSelection("home");
    setStep("browse");
  }, [setSelectedCloth, syncActivePredictionId]);

  /** Slim rail · dominant mirror · boutique rail — rails stay put; only the mirror stage swaps content. */
  const gridCols =
    step === "gender"
      ? "grid-cols-1"
      : "lg:grid-cols-[5.75rem_minmax(0,1fr)_minmax(0,13rem)] xl:grid-cols-[6rem_minmax(0,1fr)_minmax(0,14rem)]";

  const browseMirrorVariant =
    navSelection === "help" ? "help" : navSelection === "looks" ? "looks" : "browse";

  const tryOnReplicateBadge = useMemo(() => {
    if (!EXHIBITION_MODE) return null;
    if (highlightRealResult) return "REAL_RESULT";
    if (recoverPulse) return "RECOVERED";
    if (step === "result") {
      if (fallbackMode && replicatePending) return "FALLBACK";
      if (loading || (replicatePending && !result?.processedImage)) return "PROCESSING";
      if (!loading && !replicatePending && !fallbackMode && tryOnStatus === "success") return "LIVE";
      if (fallbackMode && !replicatePending) return "LIVE";
    }
    return "LIVE";
  }, [
    highlightRealResult,
    recoverPulse,
    step,
    fallbackMode,
    replicatePending,
    loading,
    tryOnStatus,
  ]);

  return (
    <div className="relative h-dvh max-h-dvh overflow-hidden overflow-x-hidden text-kiosk-muted max-lg:h-auto max-lg:min-h-dvh max-lg:max-h-none max-lg:overflow-y-auto">
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <div className="ambient-blob ambient-blob--brand" />
        <div className="ambient-blob ambient-blob--rose" />
        <div className="ambient-blob ambient-blob--info" />
      </div>
      <div className="relative z-10 mx-auto flex h-full min-h-0 min-w-0 max-w-[100vw] flex-col px-1.5 py-1 pb-[5.75rem] pt-1 sm:px-2 sm:pb-24 lg:pb-[6.25rem]">
        <div
          className={`grid min-h-0 flex-1 gap-1.5 overflow-hidden sm:gap-2 lg:gap-2 ${gridCols}`}
        >
          {step !== "gender" ? (
            <Sidebar
              activeNavId={navSelection}
              onNavigate={handleSidebarNav}
              liveOn={liveOn}
              onLiveToggle={() => setLiveOn((v) => !v)}
              aiOn={aiOn}
              onAiToggle={() => setAiOn((v) => !v)}
            />
          ) : null}

          <main className="flex min-h-0 min-w-0 flex-col gap-1.5 overflow-hidden sm:gap-2">
            {step !== "gender" ? <TopHeader liveOn={liveOn} tryOnReplicateBadge={tryOnReplicateBadge} /> : null}

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div
                key={step}
                className="kiosk-flow-stage-enter kiosk-mirror-stage-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              >
                {step === "gender" ? (
                  <FlowGenderStep
                    onChooseMen={() => {
                      setGender("men");
                      setStep("browse");
                    }}
                    onChooseWomen={() => {
                      setGender("women");
                      setStep("browse");
                    }}
                  />
                ) : null}

                {step === "browse" ? (
                  <FlowBrowseHint
                    variant={browseMirrorVariant}
                    exhibitionHints={exhibitionHints}
                    idleAmbient={idleMirrorPresence}
                  />
                ) : null}

                {step === "preview" && selectedCloth ? (
                  <FlowPreviewStep
                    item={selectedCloth}
                    gender={gender}
                    exhibitionHints={exhibitionHints}
                    onTryOnOutfit={onPreviewTryOn}
                    onChangeOutfit={onPreviewChooseAnother}
                  />
                ) : null}

                {step === "camera" ? (
                  <AutoWebcamCapture
                    key={cameraSession}
                    onComplete={onCameraComplete}
                    onFatalError={onCameraFatal}
                  />
                ) : null}

                {step === "result" ? (
                  <FlowResultStep
                    key={tryOnFlowEpoch}
                    processedImage={result?.processedImage}
                    previewImage={result?.previewImage ?? undefined}
                    originalImage={result?.originalImage}
                    loading={loading}
                    error={error}
                    status={tryOnStatus}
                    onRetry={onResultRetryCamera}
                    notice={tryOnNotice}
                    exhibitionMode={EXHIBITION_MODE}
                    fallbackMode={fallbackMode}
                    fallbackCards={fallbackCards}
                    highlightRealResult={highlightRealResult}
                    replicatePending={replicatePending}
                    aiRevealNonce={aiRevealNonce}
                    tryOnPredictionId={tryOnActivePredictionId}
                    instantIllusionRefining={
                      EXHIBITION_MODE && replicatePending && Boolean(result?.processedImage)
                    }
                  />
                ) : null}
              </div>
            </div>
          </main>

          {step !== "gender" ? (
            <CatalogPanel
              flowBrowseMode
              onFlowItemSelect={onFlowItemSelect}
              onTryOn={runTryOnRequest}
              tryOnBusy={loading || (replicatePending && !result?.processedImage)}
            />
          ) : null}
        </div>
      </div>

      <KioskActionDock
        step={step}
        selectedCloth={selectedCloth}
        loading={loading}
        hideOutfitContext={EXHIBITION_MODE && step === "result"}
        onFlip={handleFlip}
        flipDisabled={!canFlip || (loading && !result?.processedImage)}
        onRetryCamera={onResultRetryCamera}
        onNewOutfit={onResultNewOutfit}
        onIdeaPick={handleIdeaPick}
        aiEnabled={aiOn}
        stylistCatalogItems={items}
        onStylistTryOutfit={handleStylistTryOutfit}
        hasRealFailure={!EXHIBITION_MODE && step === "result" && !loading && Boolean(error)}
      />
    </div>
  );
}
