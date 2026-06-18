/**
 * Category filters — dropdown (replaces horizontal scroll strip).
 */
export default function CategoryTabs({ tabs, activeId, onChange }) {
  return (
    <div className="relative w-full">
      <label className="sr-only" htmlFor="catalog-category-select">
        Product category
      </label>
      <select
        id="catalog-category-select"
        value={activeId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-xl border border-kiosk-border bg-white py-2 pl-3 pr-9 text-[11px] font-semibold text-kiosk-ink shadow-sm transition hover:border-kiosk-accent/40 focus:border-kiosk-accent focus:outline-none focus:ring-2 focus:ring-kiosk-accent/25 lg:py-2.5 lg:text-xs"
        aria-label="Product category"
      >
        {tabs.map((tab) => (
          <option key={tab.id} value={tab.id}>
            {tab.label}
          </option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-kiosk-muted"
        aria-hidden
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
