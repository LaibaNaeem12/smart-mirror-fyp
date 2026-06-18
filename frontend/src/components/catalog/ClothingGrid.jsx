function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-kiosk-border bg-white p-1.5 shadow-sm lg:rounded-2xl lg:p-2">
      <div className="aspect-[3/4] animate-pulse rounded-lg bg-kiosk-layer lg:rounded-xl" />
      <div className="mt-1.5 h-2.5 w-[82%] animate-pulse rounded bg-kiosk-border" />
      <div className="mt-1 h-2 w-[55%] animate-pulse rounded bg-kiosk-border/80" />
    </div>
  );
}

export default function ClothingGrid({
  gender,
  selectedCloth,
  setSelectedCloth,
  onTryOn,
  items,
  loading,
  tryOnBusy = false,
  fetchError,
  hideTryOnFooter = false,
  onItemSelect,
  kioskDense = false,
}) {
  if (!gender) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-kiosk-border bg-kiosk-layer/50 px-4 py-8 text-center shadow-kiosk-inset lg:rounded-2xl lg:py-10">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-kiosk-border bg-white text-xl text-kiosk-accent shadow-sm lg:h-12 lg:w-12">
          ◇
        </div>
        <p className="font-serif text-sm font-semibold text-kiosk-ink lg:text-base">Gallery locked</p>
        <p className="mt-1.5 max-w-[15rem] text-[10px] leading-relaxed text-kiosk-muted lg:text-xs">
          Choose <span className="font-medium text-kiosk-ink">Men</span> or{" "}
          <span className="font-medium text-kiosk-ink">Women</span> to load inventory.
        </p>
      </div>
    );
  }

  const pad = kioskDense ? "p-1 lg:p-1.5" : "p-1.5 lg:p-2";
  const gap = kioskDense ? "gap-1.5 lg:gap-2" : "gap-2 lg:gap-2.5";

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${kioskDense ? "gap-1.5" : "gap-2"}`}>
      {fetchError ? (
        <div className="shrink-0 rounded-lg border border-kiosk-warn/40 bg-kiosk-warn/10 px-2.5 py-1.5 text-[10px] font-medium text-kiosk-warn lg:text-xs">
          {fetchError}
        </div>
      ) : null}

      <div
        className={`catalog-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 ${tryOnBusy ? "opacity-[0.96]" : ""}`}
        aria-busy={tryOnBusy || undefined}
      >
        {loading ? (
          <div className={`grid grid-cols-2 ${gap}`}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-2 ${gap}`}>
              {items.map((item) => {
                const selectedId = selectedCloth?._id ?? selectedCloth?.id ?? null;
                const isSelected =
                  selectedId != null && String(selectedId) === String(item._id);
                return (
                  <button
                    key={item._id}
                    type="button"
                    disabled={tryOnBusy}
                    onClick={() => {
                      setSelectedCloth(item);
                      onItemSelect?.(item);
                    }}
                    className={`kiosk-catalog-card group relative overflow-hidden rounded-lg border text-left transition-all duration-300 ease-out lg:rounded-xl ${
                      tryOnBusy ? "cursor-wait" : "cursor-pointer"
                    } ${
                      isSelected
                        ? "border-2 border-kiosk-accent-hot bg-white shadow-kiosk-float ring-2 ring-fuchsia-200/90"
                        : "border-kiosk-border bg-white shadow-sm hover:-translate-y-0.5 hover:border-kiosk-accent/40"
                    }`}
                  >
                    <div className={`relative ${pad}`}>
                      {isSelected ? (
                        <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-kiosk-primary text-[10px] text-white shadow-md lg:right-2.5 lg:top-2.5 lg:h-5 lg:w-5">
                          ✓
                        </span>
                      ) : null}
                      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-kiosk-layer ring-1 ring-kiosk-border lg:rounded-xl">
                        <img
                          src={item.imageUrl}
                          alt={item.name || "Product"}
                          className="h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-kiosk-ink/[0.04] to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
                      </div>
                      {item.name ? (
                        <p className="mt-1.5 line-clamp-2 px-0.5 text-[10px] font-semibold leading-snug text-kiosk-ink lg:mt-2 lg:text-[11px]">
                          {item.name}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {!fetchError && items.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center lg:py-10">
                <p className="text-xs font-medium text-kiosk-ink">No pieces here</p>
                <p className="mt-1 max-w-[12rem] text-[10px] text-kiosk-muted">
                  Try another category.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {!hideTryOnFooter ? (
        <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-t border-kiosk-border pt-2">
          <p className="hidden min-w-0 truncate text-[9px] text-kiosk-muted min-[1100px]:block lg:text-[10px]">
            {selectedCloth?.name ? (
              <>
                <span className="font-medium text-kiosk-ink">{selectedCloth.name}</span>
              </>
            ) : (
              "Tap a look to select"
            )}
          </p>
          <button
            type="button"
            disabled={!selectedCloth || tryOnBusy}
            onClick={() => onTryOn?.()}
            className="kiosk-glow-btn ml-auto shrink-0 rounded-full bg-kiosk-primary px-4 py-1.5 text-[10px] font-semibold text-white shadow-kiosk-float transition duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 lg:px-5 lg:py-2 lg:text-xs"
          >
            {tryOnBusy ? "Styling your look…" : "Try on"}
          </button>
        </div>
      ) : (
        <div className="relative z-10 shrink-0 border-t border-kiosk-border pt-2">
          <p className="text-center text-[9px] text-kiosk-muted lg:text-[10px]">
            {selectedCloth?.name ? (
              <span className="font-medium text-kiosk-ink">{selectedCloth.name}</span>
            ) : (
              "Tap a look to continue"
            )}
          </p>
        </div>
      )}
    </div>
  );
}
