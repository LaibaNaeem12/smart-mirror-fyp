import { useEffect, useMemo, useState, memo } from "react";

const DEFAULT_LINES = [
  "AI is analyzing your style…",
  "Matching fashion trends…",
  "Optimizing outfit harmony…",
  "Styling your outfit preview…",
  "Refining silhouette balance…",
];

const COMPACT_LINES = [
  "AI styling your outfit…",
  "Mapping silhouette & drape…",
  "Harmonizing color & texture…",
  "Refining the live preview…",
];

/**
 * Exhibition / AI presence UX — ambient layer or compact kiosk chip.
 * @param {"immersive" | "compact"} [variant]
 */
function AIPresenceOverlay({
  active = false,
  lines,
  intervalMs = 2600,
  density = "normal",
  variant = "immersive",
  className = "",
}) {
  const [idx, setIdx] = useState(0);
  const [rendered, setRendered] = useState(active);
  const [exiting, setExiting] = useState(false);
  const defaultList = variant === "compact" ? COMPACT_LINES : DEFAULT_LINES;
  const list = useMemo(() => {
    if (lines?.length) return lines;
    return defaultList;
  }, [lines, defaultList]);

  useEffect(() => {
    if (active) {
      setExiting(false);
      setRendered(true);
      return undefined;
    }
    if (!rendered) return undefined;
    setExiting(true);
    const t = window.setTimeout(() => {
      setRendered(false);
      setExiting(false);
    }, 620);
    return () => window.clearTimeout(t);
  }, [active, rendered]);

  useEffect(() => {
    if (!active || !rendered) return undefined;
    setIdx(0);
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % list.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [active, rendered, intervalMs, list.length]);

  if (!rendered) return null;

  const particleCount = variant === "compact" ? 3 : density === "dense" ? 10 : 6;

  if (variant === "compact") {
    return (
      <div
        className={`pointer-events-none absolute right-3 top-3 z-[32] flex max-w-[13rem] flex-col items-end gap-1.5 text-right transition-opacity duration-500 motion-reduce:opacity-95 sm:right-4 sm:top-4 relative ${exiting ? "ai-presence-exit opacity-0" : "opacity-100"} ${className}`}
        aria-live="polite"
      >
        <div className="flex items-center gap-2 rounded-full border border-white/55 bg-white/82 px-2.5 py-1.5 shadow-[0_6px_24px_rgba(99,102,241,0.14)] backdrop-blur-md sm:px-3 sm:py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-600/95">AI</span>
          <span className="ai-thinking-dots flex gap-0.5" aria-hidden>
            <span className="h-1 w-1 rounded-full bg-violet-500/85" />
            <span className="h-1 w-1 rounded-full bg-fuchsia-500/75" />
            <span className="h-1 w-1 rounded-full bg-sky-500/75" />
          </span>
        </div>
        <p className="rounded-lg border border-white/40 bg-white/70 px-2 py-1 text-[10px] font-medium leading-snug text-kiosk-ink/90 shadow-sm backdrop-blur-sm sm:text-[11px]">
          {list[idx % list.length]}
        </p>
        {Array.from({ length: particleCount }).map((_, i) => (
          <span
            key={i}
            className="ai-presence-particle pointer-events-none absolute rounded-full bg-gradient-to-br from-fuchsia-400/25 to-violet-500/18 blur-[1px] motion-reduce:opacity-0"
            style={{
              width: 3 + (i % 3),
              height: 3 + (i % 3),
              right: `${4 + i * 10}%`,
              top: `${18 + i * 22}%`,
              animationDelay: `${i * 0.4}s`,
            }}
            aria-hidden
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[21] overflow-hidden rounded-[inherit] transition-opacity duration-500 motion-reduce:opacity-95 ${exiting ? "ai-presence-exit opacity-0" : "opacity-100"} ${className}`}
      aria-hidden
    >
      <div className="ai-presence-gradient absolute inset-0 opacity-80 motion-reduce:opacity-50" />
      {Array.from({ length: particleCount }).map((_, i) => (
        <span
          key={i}
          className="ai-presence-particle absolute rounded-full bg-gradient-to-br from-fuchsia-400/35 to-violet-500/25 blur-[1px]"
          style={{
            width: 4 + (i % 4),
            height: 4 + (i % 4),
            left: `${8 + ((i * 17) % 84)}%`,
            top: `${12 + ((i * 23) % 76)}%`,
            animationDelay: `${i * 0.35}s`,
          }}
        />
      ))}
      <div className="ai-presence-scan absolute inset-x-0 top-0 h-[28%] opacity-35 motion-reduce:opacity-0" />
      <div className="relative flex h-full flex-col items-center justify-end pb-6 pt-10 sm:pb-8">
        <div className="mb-3 flex items-center gap-2 rounded-full border border-white/50 bg-white/75 px-4 py-2 shadow-[0_8px_32px_rgba(99,102,241,0.12)] backdrop-blur-md">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600/90">AI</span>
          <span className="ai-thinking-dots flex gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400/70" />
          </span>
        </div>
        <p className="max-w-[min(92%,20rem)] text-center font-serif text-base font-semibold leading-snug tracking-tight text-kiosk-ink drop-shadow-sm sm:text-lg">
          {list[idx % list.length]}
        </p>
      </div>
    </div>
  );
}

export default memo(AIPresenceOverlay);
