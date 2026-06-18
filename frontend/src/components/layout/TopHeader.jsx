/** Minimal kiosk status strip — premium retail chrome (not center stage). */
export default function TopHeader({ liveOn = true, tryOnReplicateBadge = null }) {
  return (
    <header className="relative shrink-0 overflow-hidden rounded-xl border border-kiosk-border bg-white px-3 py-1.5 shadow-kiosk-card lg:rounded-2xl lg:px-4 lg:py-2">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_120%_at_0%_0%,rgba(236,72,153,0.08),transparent_52%),radial-gradient(ellipse_60%_80%_at_100%_0%,rgba(249,115,22,0.06),transparent_50%)]"
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-2">
        <p className="font-serif text-[11px] font-bold tracking-tight text-kiosk-ink lg:text-xs">
          Smart Mirror
        </p>
        <div className="flex items-center gap-1.5">
          {tryOnReplicateBadge ? (
            <span
              className="rounded-full border border-violet-200/80 bg-violet-50/90 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-violet-800 shadow-sm sm:text-[9px]"
              title="Try-on pipeline (exhibition debug)"
            >
              {tryOnReplicateBadge}
            </span>
          ) : null}
          <div className="kiosk-live-pulse flex items-center gap-1.5 rounded-full border border-kiosk-border bg-kiosk-layer px-2 py-0.5">
            <span className="text-[9px] font-semibold text-kiosk-ink lg:text-[10px]">{liveOn ? "Live" : "Paused"}</span>
            <span className="relative flex h-1.5 w-1.5">
              {liveOn ? (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiosk-success/25" />
                  <span className="relative rounded-full bg-kiosk-success shadow-sm" />
                </>
              ) : (
                <span className="relative rounded-full bg-kiosk-subtle shadow-sm" />
              )}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
