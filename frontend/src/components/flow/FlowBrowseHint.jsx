/**
 * Immersive empty mirror stage while browsing catalog rail.
 * @param {"browse"|"looks"|"help"} [variant]
 * @param {boolean} [exhibitionHints] — first-pass session: extra wayfinding without clutter
 * @param {boolean} [idleAmbient] — very subtle motion on the mirror frame when idle
 */
export default function FlowBrowseHint({ variant = "browse", exhibitionHints = false, idleAmbient = false }) {
  const copy =
    variant === "help"
      ? {
          title: "How this mirror works",
          body: (
            <>
              Use the <span className="font-semibold text-kiosk-ink">boutique rail</span> to filter, tap a piece to
              preview it full size, then <span className="font-semibold text-kiosk-ink">Try your look</span> for a
              private capture. The <span className="font-semibold text-kiosk-ink">Stylist</span> below can suggest pairings — all on this kiosk.
            </>
          ),
          footer: "Rail · preview · try-on",
        }
      : variant === "looks"
        ? {
            title: "Curated for this session",
            body: (
              <>
                Filters on the rail update the grid instantly — wedding, casual, outerwear, and more.{" "}
                <span className="font-semibold text-kiosk-ink">Tap any tile</span> to see it on the mirror.
              </>
            ),
            footer: "Choose an outfit to preview",
          }
        : {
            title: "Your mirror is ready",
            body: (
              <>
                <span className="font-semibold text-kiosk-ink">Choose an outfit to preview</span> — it opens here at
                full size. When you love the look, step into try-on in one tap.
              </>
            ),
            footer: "Select a style to begin",
          };

  return (
    <section className="kiosk-mirror-stage relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-kiosk-border bg-white p-6 shadow-kiosk-card sm:p-8 lg:rounded-[1.5rem] lg:p-10">
      <div
        className={`pointer-events-none absolute inset-[10%] rounded-[2rem] border border-dashed border-kiosk-border/90 bg-kiosk-layer/55 shadow-kiosk-inset transition-opacity duration-700 lg:inset-[11%] ${
          idleAmbient ? "kiosk-idle-breathe" : ""
        }`}
        aria-hidden
      />
      <div className="relative z-10 flex max-w-lg flex-col items-center text-center">
        <div className="mb-5 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-2xl border border-kiosk-border bg-white text-3xl text-kiosk-accent shadow-kiosk-card ring-1 ring-inset ring-white/80 sm:h-[4.5rem] sm:w-[4.5rem] lg:h-[4.75rem] lg:w-[4.75rem]">
          <span aria-hidden>◇</span>
        </div>
        <p className="font-serif text-lg font-bold leading-tight tracking-tight text-kiosk-ink sm:text-xl lg:text-2xl">
          {copy.title}
        </p>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-kiosk-muted sm:text-[15px] lg:text-base">{copy.body}</p>
        {exhibitionHints && variant === "browse" ? (
          <div className="mt-5 flex w-full max-w-md flex-col gap-2.5 rounded-2xl border border-kiosk-border/80 bg-kiosk-layer/40 px-4 py-3.5 text-left shadow-sm sm:px-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-kiosk-accent">Start here</p>
            <ul className="space-y-1.5 text-[13px] leading-snug text-kiosk-ink sm:text-sm">
              <li className="flex gap-2">
                <span className="mt-0.5 font-serif text-kiosk-accent" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="font-semibold">Choose an outfit to preview</span> — tap the rail beside this mirror.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 font-serif text-kiosk-accent" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="font-semibold">Try your look</span> from the preview screen when you are ready.
                </span>
              </li>
            </ul>
          </div>
        ) : null}
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-kiosk-accent sm:text-xs">
          {copy.footer}
        </p>
      </div>
    </section>
  );
}
