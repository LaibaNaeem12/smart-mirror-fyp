import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { isTryOnFlowDebug, summarizeTryOnImageField } from "../../lib/tryOnFlowDebug";
import MirrorAIStatusOrb from "../ui/MirrorAIStatusOrb";

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function asImageUrl(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Mirror stage: while AI runs, show the live capture; when complete, only the final try-on image.
 */
function FlowResultStep({
  processedImage,
  originalImage,
  loading,
  error,
  status: _status = "generating",
  onRetry,
  notice: _notice = "",
  exhibitionMode = false,
  fallbackMode = false,
  fallbackCards: _fallbackCards = [],
  highlightRealResult = false,
  replicatePending = false,
  instantIllusionRefining = false,
  /** Instant Sharp composite URL (when distinct from final AI URL). */
  previewImage: previewImageProp,
  /** Bumps when validated Replicate output replaces instant preview (exhibition crossfade). */
  aiRevealNonce = 0,
  /** Must match the active Replicate prediction for a reveal animation to run (session isolation). */
  tryOnPredictionId = "",
}) {
  const userPhoto = asImageUrl(originalImage);
  const processed = asImageUrl(processedImage);
  const previewUrl = asImageUrl(previewImageProp);
  const awaitingGen = Boolean((loading || replicatePending) && !processed);
  const hasFinalTryon = Boolean(processed && !error);

  const [elapsedSec, setElapsedSec] = useState(0);
  const [revealAnim, setRevealAnim] = useState(null);
  const lastRevealAnchorRef = useRef("");
  const prevPredictionIdRef = useRef("");

  useLayoutEffect(() => {
    if (!exhibitionMode) {
      prevPredictionIdRef.current = "";
      lastRevealAnchorRef.current = "";
      setRevealAnim(null);
      return;
    }

    const pid = String(tryOnPredictionId || "").trim();
    if (pid !== prevPredictionIdRef.current) {
      const prev = prevPredictionIdRef.current;
      prevPredictionIdRef.current = pid;
      if (prev) {
        lastRevealAnchorRef.current = "";
        setRevealAnim(null);
      }
    }

    if (!previewImageProp || !previewUrl) {
      setRevealAnim(null);
      return;
    }

    if (aiRevealNonce <= 0 || !pid) {
      setRevealAnim(null);
      return;
    }

    const pv = previewUrl;
    const pr = processed;
    if (!pr || pv === pr) {
      setRevealAnim(null);
      return;
    }

    const anchor = `${pid}:${aiRevealNonce}`;
    if (anchor === lastRevealAnchorRef.current) return;
    lastRevealAnchorRef.current = anchor;

    setRevealAnim({ from: pv, to: pr, predictionId: pid });
  }, [exhibitionMode, aiRevealNonce, tryOnPredictionId, previewUrl, processed, previewImageProp]);

  useEffect(() => {
    if (!revealAnim) return;
    const { from, to, predictionId } = revealAnim;
    const pid = String(tryOnPredictionId || "").trim();
    if (pid && predictionId && pid !== predictionId) {
      setRevealAnim(null);
      return;
    }
    if (previewUrl && from && previewUrl !== from) {
      setRevealAnim(null);
      return;
    }
    if (processed && to && processed !== to) {
      setRevealAnim(null);
      return;
    }
  }, [revealAnim, tryOnPredictionId, previewUrl, processed]);

  useEffect(() => {
    if (!revealAnim) return undefined;
    const t = window.setTimeout(() => setRevealAnim(null), 900);
    return () => window.clearTimeout(t);
  }, [revealAnim]);

  const illusionActive =
    Boolean(userPhoto || processed) &&
    (awaitingGen || (fallbackMode && !hasFinalTryon)) &&
    !error;

  const illusionStage = illusionActive ? Math.min(3, 1 + Math.floor(elapsedSec / 4)) : 0;

  useEffect(() => {
    if (!isTryOnFlowDebug()) return;
    console.info("[try-on flow] mirror illusion", {
      userPhoto: summarizeTryOnImageField("userPhoto", userPhoto),
      processedImage: summarizeTryOnImageField("processedImage", processedImage),
      illusionActive,
      fallbackMode,
      hasFinalTryon,
    });
  }, [userPhoto, processedImage, illusionActive, fallbackMode, hasFinalTryon]);

  useEffect(() => {
    if (!illusionActive) return undefined;
    setElapsedSec(0);
    const started = Date.now();
    const tick = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [illusionActive]);

  const orbTone = highlightRealResult
    ? "complete"
    : instantIllusionRefining
      ? "idle"
      : !illusionActive && hasFinalTryon
        ? "idle"
        : !illusionActive
          ? "idle"
          : fallbackMode || elapsedSec >= 9
            ? "finalizing"
            : "processing";

  const imgEase = "cubic-bezier(0.22, 1, 0.36, 1)";
  const transitionMs = 1400;
  const motionSafeTransition = useMemo(() => {
    if (typeof window === "undefined") {
      return `opacity ${transitionMs}ms ${imgEase}, transform ${transitionMs}ms ${imgEase}, filter ${transitionMs}ms ${imgEase}`;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "opacity 220ms ease-out, transform 220ms ease-out, filter 220ms ease-out"
      : `opacity ${transitionMs}ms ${imgEase}, transform ${transitionMs}ms ${imgEase}, filter ${transitionMs}ms ${imgEase}`;
  }, [imgEase, transitionMs]);

  const showEmpty = !userPhoto && !processed && !loading && !error && !replicatePending;

  const tryonImgKey =
    processed && processed.length > 200
      ? `${processed.length}:${processed.slice(48, 112)}`
      : processed || "none";

  const effectLayerClass = [
    "pointer-events-none absolute inset-0 z-[4] overflow-hidden rounded-[inherit]",
    illusionActive ? `mirror-ai-fx mirror-ai-fx--s${illusionStage}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const expandFrame = Boolean(hasFinalTryon || (awaitingGen && userPhoto) || userPhoto || processed || loading || replicatePending);

  return (
    <section className="kiosk-mirror-stage relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-kiosk-border/90 bg-white p-3 shadow-[0_2px_8px_rgba(49,46,129,0.06),0_16px_40px_rgba(49,46,129,0.1)] sm:p-4 lg:rounded-[1.5rem] lg:p-5">
      {error && !exhibitionMode ? (
        <div
          className="relative z-10 mx-auto mb-3 w-full max-w-xl shrink-0 overflow-hidden rounded-2xl border border-kiosk-err/18 bg-gradient-to-b from-white via-white to-red-50/35 px-4 py-4 shadow-[0_4px_24px_rgba(49,46,129,0.06)] lg:px-5 lg:py-4"
          role="alert"
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-kiosk-err/[0.06] blur-2xl"
            aria-hidden
          />
          <p className="relative text-[10px] font-bold uppercase tracking-[0.22em] text-kiosk-err/90">Mirror notice</p>
          <p className="relative mt-1.5 font-serif text-base font-semibold tracking-tight text-kiosk-ink lg:text-lg">
            Try-on needs another attempt
          </p>
          <p className="relative mt-2 text-[13px] leading-relaxed text-kiosk-muted lg:text-sm">{error}</p>
          <p className="relative mt-3 border-t border-kiosk-border/50 pt-3 text-xs leading-relaxed text-kiosk-subtle">
            Retake your photo or choose another look from the rail — your mirror session is still active.
          </p>
          <div className="relative mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onRetry?.()}
              className="rounded-lg border border-kiosk-border bg-white px-3 py-1.5 text-xs font-semibold text-kiosk-ink transition hover:border-kiosk-accent/40 hover:bg-kiosk-layer"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mirror-frame-glow flex min-h-0 flex-1 flex-col rounded-[1.25rem] p-[2px] shadow-kiosk-float lg:rounded-[1.4rem]">
          <div className="relative flex min-h-[min(52dvh,22rem)] flex-1 flex-col overflow-hidden rounded-[1.1rem] border border-kiosk-border/95 bg-gradient-to-b from-slate-50/90 to-white lg:min-h-0 lg:rounded-[1.25rem]">
            <div className="kiosk-tryon-viewport relative flex min-h-0 flex-1 flex-col">
              <div className="kiosk-tryon-viewport-inner relative flex min-h-[min(48dvh,18rem)] flex-1 flex-col items-center justify-center px-3 py-3 sm:px-4 sm:py-4 lg:min-h-0">
                <div
                  className={`ai-mirror-hero-frame relative w-full max-w-[min(calc(100vw-2rem),34rem)] shrink-0 overflow-visible rounded-[1.15rem] border border-kiosk-border/70 bg-gradient-to-b from-white/95 to-slate-50/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.75),inset_0_2px_20px_rgba(255,255,255,0.55),0_12px_40px_rgba(49,46,129,0.08)] ring-1 ring-inset ring-white/90 motion-reduce:shadow-inner lg:rounded-[1.25rem] ${
                    highlightRealResult ? "ai-real-result-highlight ai-real-result-highlight--pulse" : ""
                  } ${
                    expandFrame
                      ? "aspect-[3/4] max-h-[min(78dvh,42rem)]"
                      : "min-h-[min(40dvh,14rem)] w-full max-w-[min(calc(100vw-2rem),26rem)]"
                  }`}
                >
                  {!(exhibitionMode && hasFinalTryon) ? <MirrorAIStatusOrb tone={orbTone} /> : null}

                  <div
                    className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] opacity-90"
                    aria-hidden
                    style={{
                      background:
                        "radial-gradient(ellipse 90% 65% at 50% 42%, rgba(255,255,255,0.45) 0%, transparent 55%), radial-gradient(ellipse 50% 45% at 12% 88%, rgba(139,92,246,0.07) 0%, transparent 50%), radial-gradient(ellipse 48% 40% at 90% 86%, rgba(236,72,153,0.06) 0%, transparent 50%)",
                    }}
                  />

                  {illusionActive ? <div className={effectLayerClass} aria-hidden /> : null}

                  <div className="relative z-[2] flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[inherit] p-2 sm:p-3">
                    {illusionActive ? (
                      <div
                        className="pointer-events-none absolute inset-3 z-[3] overflow-hidden rounded-[inherit] motion-reduce:opacity-0"
                        aria-hidden
                      >
                        <div className="ai-feed-scan-line absolute inset-x-0 top-0 h-[38%] rounded-sm opacity-80" />
                      </div>
                    ) : null}

                    {illusionActive && illusionStage >= 2 ? (
                      <div
                        className="ai-fabric-haze pointer-events-none absolute inset-x-[14%] inset-y-[32%] z-[3] rounded-[45%] motion-reduce:opacity-0"
                        aria-hidden
                      />
                    ) : null}

                    {hasFinalTryon &&
                    exhibitionMode &&
                    previewUrl &&
                    revealAnim &&
                    revealAnim.from !== revealAnim.to ? (
                      <div
                        key={`exhibit-reveal-${String(tryOnPredictionId || "").trim()}-${aiRevealNonce}`}
                        className="relative z-[2] m-auto flex h-full w-full max-h-full max-w-full items-center justify-center"
                      >
                        <img
                          src={revealAnim.to}
                          alt="AI try-on preview"
                          decoding="async"
                          className="ai-exhibit-reveal-to-layer kiosk-tryon-result-img pointer-events-none absolute inset-0 z-[1] m-auto max-h-full max-w-full object-contain object-center"
                          style={{
                            filter: "brightness(1.01) contrast(1.02) saturate(1.03)",
                          }}
                        />
                        <img
                          src={revealAnim.from}
                          alt=""
                          decoding="async"
                          className="ai-exhibit-reveal-from-layer kiosk-tryon-result-img pointer-events-none absolute inset-0 z-[2] m-auto max-h-full max-w-full object-contain object-center"
                          aria-hidden
                          style={{
                            filter: "brightness(1.01) contrast(1.02) saturate(1.03)",
                          }}
                        />
                      </div>
                    ) : hasFinalTryon ? (
                      <img
                        key={tryonImgKey}
                        src={processed}
                        alt="AI try-on preview"
                        decoding="async"
                        className={`kiosk-tryon-result-img relative z-[2] m-auto max-h-full max-w-full object-contain object-center ${
                          instantIllusionRefining ? "ai-mirror-tryon-refining" : "ai-mirror-tryon-frame-swap"
                        }`}
                        style={{
                          transition: motionSafeTransition,
                          opacity: 1,
                          transform: "scale(1)",
                          filter: "brightness(1.01) contrast(1.02) saturate(1.03)",
                        }}
                      />
                    ) : awaitingGen && userPhoto ? (
                      <div className="relative z-[2] flex h-full w-full flex-col items-center justify-center">
                        <img
                          src={userPhoto}
                          alt=""
                          decoding="async"
                          className="kiosk-tryon-result-img ai-mirror-hero-idle-breathe m-auto max-h-full max-w-full object-contain object-center"
                          style={{
                            transition: motionSafeTransition,
                            opacity: loading ? 0.92 : 0.96,
                            transform: loading ? "scale(1.01)" : "scale(1)",
                            filter: loading ? "brightness(1.02) contrast(1.02)" : "brightness(1.01) contrast(1.02)",
                          }}
                          aria-hidden
                        />
                        {!exhibitionMode ? (
                          <p className="pointer-events-none absolute bottom-3 left-1/2 z-[6] max-w-[90%] -translate-x-1/2 rounded-full border border-kiosk-border/60 bg-white/90 px-3 py-1 text-center text-[11px] font-semibold text-kiosk-ink shadow-sm backdrop-blur-sm sm:text-xs">
                            Generating your outfit…
                          </p>
                        ) : null}
                      </div>
                    ) : awaitingGen && !userPhoto ? (
                      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-4 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-kiosk-border/70 bg-white/90 shadow-inner ring-1 ring-inset ring-white/80">
                          <span className="font-serif text-lg text-kiosk-accent/75">◇</span>
                        </div>
                        {!exhibitionMode ? (
                          <>
                            <p className="text-sm font-semibold text-kiosk-ink">Generating your outfit…</p>
                            <p className="text-xs text-kiosk-muted">Your preview will appear here</p>
                          </>
                        ) : (
                          <span className="sr-only">Mirror is composing your look</span>
                        )}
                      </div>
                    ) : showEmpty ? (
                      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-4 text-center" aria-hidden>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-kiosk-border/70 bg-white/90 shadow-inner ring-1 ring-inset ring-white/80">
                          <span className="font-serif text-lg text-kiosk-accent/75">◇</span>
                        </div>
                        <p className="text-sm font-semibold text-kiosk-ink">AI Try-On Ready</p>
                        <p className="text-xs text-kiosk-muted">Your preview will appear here</p>
                      </div>
                    ) : userPhoto && !processed && !exhibitionMode ? (
                      <img
                        src={userPhoto}
                        alt="Your mirror capture"
                        decoding="async"
                        className="kiosk-tryon-result-img ai-mirror-hero-idle-breathe relative z-[2] m-auto max-h-full max-w-full object-contain object-center"
                        style={{ transition: motionSafeTransition }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(FlowResultStep);
