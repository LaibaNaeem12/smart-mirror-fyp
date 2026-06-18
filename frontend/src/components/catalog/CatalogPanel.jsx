import { useCatalog } from "../../catalog/CatalogContext";
import CategoryTabs from "./CategoryTabs";
import ClothingGrid from "./ClothingGrid";
import TipMessage from "./TipMessage";

/** Narrow boutique rail for kiosk — tight spacing, high density. */
export default function CatalogPanel({ onTryOn, flowBrowseMode = false, onFlowItemSelect, tryOnBusy = false }) {
  const {
    gender,
    tabs,
    activeTabId,
    setActiveTabId,
    filteredItems,
    loading,
    catalogError,
    selectedCloth,
    setSelectedCloth,
  } = useCatalog();

  return (
    <section className="relative z-10 flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-kiosk-border bg-white p-1.5 shadow-kiosk-card lg:rounded-2xl lg:p-2">
      <div
        className="pointer-events-none absolute -right-12 top-2 h-32 w-32 rounded-full bg-kiosk-brand/10 blur-2xl"
        aria-hidden
      />

      <header className="relative mb-1.5 shrink-0 border-b border-kiosk-border pb-1.5">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.28em] text-kiosk-accent">Boutique</p>
            <h3 className="mt-0.5 font-serif text-sm font-bold tracking-tight text-kiosk-ink lg:text-base">
              Looks
            </h3>
            <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-kiosk-muted lg:text-[10px]">
              {gender
                ? flowBrowseMode
                  ? "Tap to preview on mirror."
                  : "Categories & pieces."
                : "Choose collection first."}
            </p>
          </div>
          {gender ? (
            <div className="shrink-0 rounded-lg border border-kiosk-border bg-kiosk-layer px-1.5 py-0.5 text-center shadow-sm">
              <p className="text-[8px] font-semibold uppercase tracking-wide text-kiosk-subtle">#</p>
              <p className="font-serif text-sm font-bold tabular-nums text-kiosk-accent">
                {loading ? "—" : filteredItems.length}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      {gender ? (
        <div className="relative mb-1.5 shrink-0">
          <p className="mb-0.5 text-[8px] font-semibold uppercase tracking-widest text-kiosk-subtle">Filter</p>
          <CategoryTabs tabs={tabs} activeId={activeTabId} onChange={setActiveTabId} />
        </div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ClothingGrid
          onTryOn={onTryOn}
          items={filteredItems}
          loading={loading}
          tryOnBusy={tryOnBusy}
          fetchError={catalogError}
          gender={gender}
          selectedCloth={selectedCloth}
          setSelectedCloth={setSelectedCloth}
          hideTryOnFooter={flowBrowseMode}
          onItemSelect={flowBrowseMode ? onFlowItemSelect : undefined}
          kioskDense
        />
      </div>

      <div className="relative mt-1.5 shrink-0 border-t border-kiosk-border pt-1.5">
        <TipMessage hasGender={!!gender} />
      </div>
    </section>
  );
}
