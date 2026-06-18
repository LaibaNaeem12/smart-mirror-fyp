import StylistDockModule from "./StylistDockModule";

const RECS = ["Evening look", "Office chic", "Weekend casual"];

/**
 * Premium kiosk action dock — stylist, context strip, recommendations.
 * Preview / try-on primary actions live on the mirror stage.
 */
export default function KioskActionDock({
  step,
  selectedCloth,
  loading,
  onFlip,
  flipDisabled,
  onRetryCamera,
  onNewOutfit,
  onIdeaPick,
  aiEnabled = true,
  stylistCatalogItems,
  onStylistTryOutfit,
  hasRealFailure = false,
  /** Exhibition: hide outfit thumbnail / copy on final mirror (image-only stage). */
  hideOutfitContext = false,
}) {
  const name = selectedCloth?.name || "";
  const cat = selectedCloth?.category || "";

  const showResultActions = step === "result";
  const showCameraHint = step === "camera";
  const showBrowseHint = step === "browse";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200]">
      <div className="pointer-events-auto relative z-[200] mx-auto max-w-[100vw] overflow-visible px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] sm:px-3">
        <div className="relative overflow-visible rounded-t-2xl border border-b-0 border-slate-200/95 bg-gradient-to-b from-white via-slate-50/80 to-slate-100/90 shadow-kiosk-dock sm:rounded-t-[1.35rem]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent"
            aria-hidden
          />

          <div className="flex min-h-[4.25rem] flex-col gap-2 px-2.5 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-2.5">
            {/* Outfit / context */}
            <div className="min-w-0 flex-1 border-b border-kiosk-border pb-2 sm:border-b-0 sm:pb-0">
              {hideOutfitContext ? (
                <p className="sr-only">Try-on actions</p>
              ) : selectedCloth && (step === "preview" || step === "browse") ? (
                <div className="flex min-w-0 items-center gap-2">
                  <div className="h-11 w-9 shrink-0 overflow-hidden rounded-lg border border-kiosk-border bg-kiosk-layer shadow-sm transition hover:border-kiosk-accent/35">
                    {(selectedCloth.imageUrl || selectedCloth.image) && (
                      <img
                        src={selectedCloth.imageUrl || selectedCloth.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-kiosk-accent">
                      Selected look
                    </p>
                    <p className="truncate font-serif text-xs font-bold text-kiosk-ink sm:text-sm">{name}</p>
                    {cat ? (
                      <p className="truncate text-[9px] text-kiosk-muted sm:text-[10px]">{cat}</p>
                    ) : null}
                  </div>
                </div>
              ) : selectedCloth && (step === "camera" || step === "result") ? (
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-kiosk-accent">
                    Selected look
                  </p>
                  <p className="truncate font-serif text-xs font-bold text-kiosk-ink sm:text-sm">{name}</p>
                  {cat ? <p className="truncate text-[9px] text-kiosk-muted sm:text-[10px]">{cat}</p> : null}
                </div>
              ) : showBrowseHint ? (
                <p className="max-w-[14rem] text-[11px] font-medium leading-snug text-kiosk-muted sm:max-w-none sm:text-xs sm:leading-relaxed">
                  <span className="font-semibold text-kiosk-ink">Browse</span> the rail — tap a piece to preview on
                  the mirror, then try your look.
                </p>
              ) : showCameraHint ? (
                <p className="max-w-[15rem] text-[11px] font-semibold leading-snug text-kiosk-accent sm:max-w-none sm:text-xs sm:leading-relaxed">
                  AI Try-On Ready — hold still for the countdown. Your look appears on the mirror right after capture.
                </p>
              ) : step === "gender" ? (
                <p className="text-[11px] leading-snug text-kiosk-muted sm:text-xs">
                  Luxury smart mirror · touch to begin
                </p>
              ) : null}
            </div>

            {/* Recommendations */}
            {(step === "browse" || step === "preview") && (
              <div className="hidden min-w-0 shrink-0 items-center gap-1.5 md:flex">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-kiosk-subtle">Ideas</span>
                <div className="flex flex-wrap gap-1">
                  {RECS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={loading}
                      onClick={() => onIdeaPick?.(r)}
                      className="rounded-full border border-kiosk-border bg-white px-2 py-0.5 text-[9px] font-semibold text-kiosk-ink transition duration-150 hover:border-kiosk-accent/40 hover:bg-kiosk-layer active:scale-[0.97] disabled:cursor-wait disabled:opacity-45"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Context actions — overflow-visible so assistant panel can extend upward */}
            <div className="relative z-[240] flex shrink-0 flex-wrap items-center justify-end gap-2 overflow-visible">
              {showResultActions ? (
                <>
                  <button
                    type="button"
                    disabled={flipDisabled || hasRealFailure}
                    onClick={onFlip}
                    className="rounded-xl border border-kiosk-border bg-white px-3 py-2 text-[10px] font-semibold text-kiosk-ink shadow-sm transition duration-150 hover:border-kiosk-accent/40 hover:bg-kiosk-layer active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:text-[11px]"
                  >
                    Flip view
                  </button>
                  {hasRealFailure ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={onRetryCamera}
                      className="rounded-xl border border-kiosk-border bg-white px-3 py-2 text-[10px] font-semibold text-kiosk-ink shadow-sm transition duration-150 hover:border-kiosk-accent/40 hover:bg-kiosk-layer active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:text-[11px]"
                    >
                      Try again
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onNewOutfit}
                    className="rounded-xl border border-kiosk-border bg-white px-3 py-2 text-[10px] font-semibold text-kiosk-ink shadow-sm transition duration-150 hover:border-kiosk-accent/40 hover:bg-kiosk-layer active:scale-[0.98] disabled:opacity-50 sm:text-[11px]"
                  >
                    New outfit
                  </button>
                </>
              ) : null}
              {step !== "gender" ? (
                <StylistDockModule
                  compact={step === "camera"}
                  aiEnabled={aiEnabled}
                  catalogItems={stylistCatalogItems}
                  onStylistTryOutfit={onStylistTryOutfit}
                  interactionLocked={loading}
                />
              ) : (
                <StylistDockModule
                  compact
                  aiEnabled={aiEnabled}
                  catalogItems={stylistCatalogItems}
                  onStylistTryOutfit={onStylistTryOutfit}
                  interactionLocked={loading}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
