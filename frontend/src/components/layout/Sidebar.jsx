import { useEffect, useState } from "react";
import { useCatalog } from "../../catalog/CatalogContext";

const menu = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "tryOn", label: "Try On", icon: "◆" },
  { id: "looks", label: "Looks", icon: "✦" },
  { id: "help", label: "Help", icon: "?" },
];

const FASHION_TIPS = [
  "Balance silhouette & proportion.",
  "Neutrals anchor bold accents.",
  "Shoes finish the story.",
  "Texture beats loud logos.",
  "One focal piece per look.",
];

/** Slim kiosk rail — slightly wider for readable micro-type; still luxury-dense. */
export default function Sidebar({
  activeNavId = "home",
  onNavigate,
  liveOn = true,
  onLiveToggle,
  aiOn = true,
  onAiToggle,
}) {
  const { gender, filteredItems } = useCatalog();
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTipIdx((i) => (i + 1) % FASHION_TIPS.length);
    }, 8200);
    return () => clearInterval(id);
  }, []);

  const railCount = gender ? filteredItems.length : null;

  return (
    <aside className="relative hidden h-full min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden overflow-y-auto rounded-xl border border-kiosk-border bg-gradient-to-b from-kiosk-layer/80 via-white to-kiosk-canvas-peach/50 py-2.5 shadow-kiosk-card lg:flex lg:rounded-2xl lg:py-3.5">
      <div
        className="pointer-events-none absolute -left-6 top-12 h-24 w-24 rounded-full bg-kiosk-brand/10 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-4 h-24 bg-gradient-to-b from-kiosk-accent/8 to-transparent blur-xl"
        aria-hidden
      />

      <div className="relative z-10 flex w-full flex-col items-center px-2">
        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-1 rounded-2xl bg-kiosk-brand/10 opacity-80 blur-md"
            aria-hidden
          />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-kiosk-primary text-lg text-white shadow-kiosk-float ring-1 ring-white">
            <span aria-hidden>👗</span>
          </div>
        </div>
        <p className="mt-2 max-w-full text-center font-serif text-[9px] font-bold uppercase leading-snug tracking-[0.08em] text-kiosk-ink">
          Smart Mirror
        </p>
        <div className="mt-2.5 flex w-full flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onLiveToggle?.()}
            aria-pressed={liveOn}
            title={liveOn ? "Live stream on — tap to pause" : "Paused — tap to go live"}
            className="kiosk-live-pulse flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-kiosk-border bg-kiosk-layer px-1.5 py-1.5 shadow-sm transition hover:bg-white"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {liveOn ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiosk-success/30" />
                  <span className="relative rounded-full bg-kiosk-success shadow-sm" />
                </>
              ) : (
                <span className="relative rounded-full bg-kiosk-subtle shadow-sm" />
              )}
            </span>
            <span
              className={`text-[8px] font-bold uppercase tracking-wide ${liveOn ? "text-kiosk-success" : "text-kiosk-muted"}`}
            >
              {liveOn ? "Live" : "Paused"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onAiToggle?.()}
            aria-pressed={aiOn}
            title={aiOn ? "AI on — tap to turn off" : "AI off — tap to enable"}
            className={`flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border px-1.5 py-1 shadow-sm transition ${
              aiOn
                ? "border-kiosk-accent/35 bg-white hover:bg-kiosk-layer"
                : "border-kiosk-border bg-white hover:bg-kiosk-layer"
            }`}
          >
            <span
              className={`text-[7px] font-black tracking-wide ${aiOn ? "text-kiosk-accent" : "text-kiosk-subtle"}`}
            >
              AI
            </span>
            <span className="text-[7px] font-semibold uppercase tracking-wide text-kiosk-muted">
              {aiOn ? "On" : "Off"}
            </span>
          </button>
        </div>
      </div>

      <div className="relative z-10 mt-3 w-full px-2">
        <div className="rounded-xl border border-kiosk-border bg-kiosk-layer px-2 py-2 text-center shadow-kiosk-inset">
          <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-kiosk-subtle">Session</p>
          <p className="mt-1 font-mono text-[10px] font-semibold leading-tight tabular-nums text-kiosk-ink">
            Mirror · 01
          </p>
          {railCount != null ? (
            <p className="mt-1.5 border-t border-kiosk-border pt-1.5 text-[8px] font-semibold leading-snug text-kiosk-accent">
              <span className="tabular-nums">{railCount}</span> in rail
            </p>
          ) : (
            <p className="mt-1.5 border-t border-kiosk-border pt-1.5 text-[7px] font-medium leading-snug text-kiosk-muted">
              Pick a collection
            </p>
          )}
        </div>
      </div>

      <nav className="relative z-10 mt-3 flex w-full flex-col items-stretch gap-1 px-1.5">
        {menu.map((item) => {
          const active = activeNavId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => onNavigate?.(item.id)}
              className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-[9px] font-semibold transition duration-150 active:scale-[0.98] ${
                active
                  ? "bg-kiosk-primary text-white shadow-kiosk-float hover:brightness-110"
                  : "text-kiosk-muted hover:bg-white/80 hover:text-kiosk-ink"
              }`}
            >
              <span className="text-[15px] leading-none opacity-95">{item.icon}</span>
              <span className="max-w-full px-0.5 text-[8px] uppercase tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="relative z-10 mt-auto flex w-full flex-1 flex-col justify-end px-2 pb-1 pt-4">
        <div
          className="rounded-xl border border-dashed border-kiosk-border bg-white px-2 py-2.5 text-center shadow-inner transition-opacity duration-700"
          key={tipIdx}
        >
          <p className="text-[7px] font-bold uppercase tracking-[0.18em] text-kiosk-accent">Tip</p>
          <p className="mt-1.5 line-clamp-4 text-[8px] font-medium leading-relaxed text-kiosk-muted">
            {FASHION_TIPS[tipIdx]}
          </p>
        </div>
      </div>
    </aside>
  );
}
