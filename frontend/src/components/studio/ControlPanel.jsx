import { useCatalog } from "../../catalog/CatalogContext";

const GENDER_OPTIONS = [
  { label: "Men", slug: "men" },
  { label: "Women", slug: "women" },
];

const viewOptions = ["Real-time", "AI Enhanced"];

export default function ControlPanel({ viewMode, setViewMode }) {
  const { gender, setGender } = useCatalog();

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-col justify-between space-y-3 overflow-hidden overflow-y-auto rounded-[1.25rem] border border-kiosk-border bg-kiosk-surface p-2.5 shadow-kiosk-card lg:rounded-[1.35rem] lg:space-y-3.5 lg:p-3">
      <div
        className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-kiosk-brand/8 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-kiosk-info/6 blur-3xl"
        aria-hidden
      />

      <div className="relative shrink-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-kiosk-muted lg:text-[10px]">
          Choose Your Collection
        </p>
        <h3 className="mt-1 font-serif text-sm font-bold leading-snug text-kiosk-ink lg:text-[0.95rem]">
          Men&apos;s & women&apos;s
        </h3>
        <div className="mt-2 flex flex-col gap-2 lg:mt-2.5 lg:gap-2">
          {GENDER_OPTIONS.map(({ label, slug }) => {
            const active = gender === slug;
            return (
              <button
                key={slug}
                type="button"
                onClick={() => setGender(slug)}
                className={`relative overflow-hidden rounded-xl py-2.5 text-sm font-bold tracking-wide transition-all duration-300 lg:rounded-2xl lg:py-3 lg:text-[0.95rem] ${
                  active
                    ? "border border-white/30 bg-kiosk-primary text-white shadow-md ring-1 ring-white/30"
                    : "border border-kiosk-border bg-kiosk-layer text-kiosk-ink shadow-sm hover:border-kiosk-accent/40 hover:bg-white"
                }`}
              >
                {active ? (
                  <span
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent"
                    aria-hidden
                  />
                ) : null}
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>
        {!gender ? (
          <p className="mt-2 text-[9px] leading-relaxed text-kiosk-muted lg:text-[10px]">
            Inventory loads for your selection only.
          </p>
        ) : null}
      </div>

      <div className="relative shrink-0 border-t border-kiosk-border pt-2 lg:pt-2.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-kiosk-muted lg:text-[10px]">
          Display mode
        </p>
        <div className="mt-1.5 space-y-1 lg:mt-2 lg:space-y-1.5">
          {viewOptions.map((item) => {
            const active = viewMode === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setViewMode(item)}
                className={`relative w-full overflow-hidden rounded-xl py-2 text-[11px] font-semibold transition-all duration-300 lg:rounded-2xl lg:py-2.5 lg:text-xs ${
                  active
                    ? "border border-kiosk-accent/30 bg-kiosk-layer text-kiosk-ink shadow-sm ring-1 ring-kiosk-accent/20"
                    : "border border-kiosk-border bg-white text-kiosk-ink hover:border-kiosk-accent/35 hover:bg-kiosk-layer"
                }`}
              >
                {active ? (
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-kiosk-primary lg:w-1"
                    aria-hidden
                  />
                ) : null}
                <span className="relative pl-1">{item}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
