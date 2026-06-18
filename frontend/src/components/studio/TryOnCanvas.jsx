import { useCatalog } from "../../catalog/CatalogContext";

function GenderPrompt() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-kiosk-layer via-kiosk-surface to-kiosk-layer px-2 py-3 text-center lg:gap-2 lg:px-3 lg:py-4">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-kiosk-border bg-white text-lg shadow-kiosk-card lg:h-12 lg:w-12 lg:text-xl"
        aria-hidden
      >
        ✨
      </div>
      <div>
        <p className="font-serif text-xs font-bold tracking-tight text-kiosk-ink lg:text-sm">Smart mirror</p>
        <p className="mx-auto mt-1 max-w-[17rem] text-[10px] leading-relaxed text-kiosk-muted lg:text-[11px]">
          <span className="font-semibold text-kiosk-ink">Choose Your Collection</span> to activate the studio.
        </p>
      </div>
    </div>
  );
}

function OutfitPrompt() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-kiosk-layer/90 via-kiosk-surface to-kiosk-layer px-2 py-3 text-center lg:gap-2 lg:px-3 lg:py-4">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-dashed border-kiosk-border bg-white text-kiosk-accent shadow-kiosk-card lg:h-12 lg:w-12"
        aria-hidden
      >
        <svg
          className="h-6 w-6 lg:h-7 lg:w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </div>
      <div>
        <p className="font-serif text-xs font-bold text-kiosk-ink lg:text-sm">Select a garment</p>
        <p className="mx-auto mt-1 max-w-[15rem] text-[10px] leading-relaxed text-kiosk-muted lg:text-[11px]">
          Choose from the gallery — it appears here for try-on.
        </p>
      </div>
    </div>
  );
}

/** Legacy studio mirror panel (optional embed). Guided flow uses `components/flow/*` from Home. */
export default function TryOnCanvas({ loading, onTryOn, result, error }) {
  const { gender, selectedCloth } = useCatalog();

  const clothRef = selectedCloth?.imageUrl || selectedCloth?.image || null;
  const tryOnImage = result?.processedImage || null;
  const heroSrc = tryOnImage || clothRef || null;

  const showGenderPrompt = !gender;
  const showOutfitPrompt = gender && !clothRef && !tryOnImage && !loading;
  const showPlaceholder = showGenderPrompt || showOutfitPrompt;

  return (
    <section className="relative z-10 flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-kiosk-border bg-kiosk-surface p-1.5 shadow-kiosk-card lg:rounded-[1.35rem] lg:p-2">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-10%,rgba(248,250,252,0.95),transparent_55%),radial-gradient(ellipse_50%_45%_at_100%_100%,rgba(37,99,235,0.06),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-kiosk-brand/8 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 mb-1 flex shrink-0 items-center justify-between gap-2 lg:mb-1.5">
        <p className="font-serif text-[11px] font-semibold tracking-tight text-kiosk-ink lg:text-xs">Try-on studio</p>
        <div className="rounded-full border border-kiosk-border bg-kiosk-layer px-2 py-0.5 text-[9px] font-semibold text-kiosk-muted shadow-sm lg:px-2 lg:py-0.5 lg:text-[10px]">
          {loading ? "Processing…" : tryOnImage ? "Live result" : "Mirror ready"}
        </div>
      </div>

      {error ? (
        <div
          className="relative z-10 mb-1 shrink-0 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-900 lg:mb-1.5 lg:px-2.5 lg:py-1.5 lg:text-xs"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1 gap-1 lg:gap-1.5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mirror-frame-glow h-full min-h-0 w-full rounded-[1.1rem] p-[2px] shadow-kiosk-card lg:rounded-[1.25rem]">
            <div className="relative h-full min-h-0 w-full overflow-hidden rounded-[1rem] border border-kiosk-border bg-gradient-to-b from-white via-kiosk-layer to-kiosk-layer shadow-kiosk-inset lg:rounded-[1.15rem]">
              <div className="relative h-full min-h-0 w-full">
                {showPlaceholder ? (
                  <div className="h-full min-h-0 w-full">
                    {showGenderPrompt ? <GenderPrompt /> : <OutfitPrompt />}
                  </div>
                ) : heroSrc ? (
                  <img
                    src={heroSrc}
                    alt={tryOnImage ? "Try-on result" : "Selected garment"}
                    className={`h-full w-full object-contain object-center ${loading ? "opacity-50" : ""}`}
                  />
                ) : null}
                {loading ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/70"
                    aria-busy="true"
                  >
                    <span className="rounded-full border border-kiosk-border bg-white px-2.5 py-1 text-[11px] font-semibold text-kiosk-ink shadow-kiosk-float lg:px-3 lg:py-1.5 lg:text-xs">
                      Applying try-on…
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex w-[3.85rem] shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-[0.85rem] border border-kiosk-border bg-kiosk-layer p-1 shadow-kiosk-card lg:w-[4.25rem] lg:gap-1.5 lg:rounded-[1rem] lg:p-1.5">
          <button
            type="button"
            disabled={loading || !gender}
            className="w-full rounded-lg border border-kiosk-border bg-white px-0.5 py-1.5 text-[8px] font-semibold leading-tight text-kiosk-ink shadow-sm transition hover:border-kiosk-accent/35 hover:bg-kiosk-layer disabled:pointer-events-none disabled:opacity-50 lg:rounded-xl lg:py-2 lg:text-[9px]"
            onClick={() => onTryOn?.()}
          >
            Change outfit
          </button>
          <button
            type="button"
            disabled={loading || !clothRef}
            onClick={() => onTryOn?.()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-kiosk-primary text-sm text-white shadow-kiosk-float transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50 lg:h-10 lg:w-10 lg:text-base"
            title="Try on"
          >
            📷
          </button>
          <button
            type="button"
            disabled={loading || !clothRef}
            className="w-full rounded-lg border border-kiosk-border bg-white px-0.5 py-1.5 text-[8px] font-semibold leading-tight text-kiosk-ink shadow-sm transition hover:border-kiosk-accent/35 hover:bg-kiosk-layer disabled:pointer-events-none disabled:opacity-50 lg:rounded-xl lg:py-2 lg:text-[9px]"
            onClick={() => onTryOn?.()}
          >
            Try on
          </button>
        </aside>
      </div>
    </section>
  );
}
