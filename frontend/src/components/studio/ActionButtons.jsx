const actions = [
  {
    label: "Flip",
    emoji: "🔄",
    ring: "ring-kiosk-accent/30",
    wash: "from-kiosk-brand/15 via-kiosk-layer to-transparent",
  },
  {
    label: "Light",
    emoji: "💡",
    ring: "ring-kiosk-warn/30",
    wash: "from-kiosk-warn/15 via-kiosk-layer to-transparent",
  },
  {
    label: "Zoom",
    emoji: "🔍",
    ring: "ring-kiosk-info/25",
    wash: "from-kiosk-info/12 via-kiosk-layer to-transparent",
  },
];

export default function ActionButtons({ onFlip, onLight, onZoom, flipDisabled }) {
  const handlers = { Flip: onFlip, Light: onLight, Zoom: onZoom };

  return (
    <section className="relative z-20 flex h-full min-h-0 max-w-[4.5rem] flex-col items-center justify-center gap-2 self-stretch overflow-hidden rounded-[1.25rem] border border-kiosk-border bg-kiosk-surface p-2 shadow-kiosk-card lg:max-w-[4.75rem] lg:rounded-[1.35rem] lg:gap-2 lg:p-2">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(37,99,235,0.06),transparent)]"
        aria-hidden
      />
      {actions.map(({ label, emoji, ring, wash }) => (
        <button
          key={label}
          type="button"
          disabled={label === "Flip" && flipDisabled}
          onClick={(e) => {
            e.stopPropagation();
            handlers[label]?.();
          }}
          className={`group relative flex h-[3.35rem] w-[3.35rem] shrink-0 flex-col items-center justify-center overflow-hidden rounded-full border border-kiosk-border bg-white text-[10px] font-semibold text-kiosk-ink shadow-sm ring-1 transition hover:scale-[1.03] hover:border-kiosk-accent/35 hover:bg-kiosk-layer hover:shadow-md active:scale-95 lg:h-[3.6rem] lg:w-[3.6rem] ${ring} ${
            label === "Flip" && flipDisabled
              ? "pointer-events-none cursor-not-allowed opacity-35"
              : ""
          }`}
          title={label}
        >
          <span
            className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${wash} opacity-0 transition duration-300 group-hover:opacity-100`}
            aria-hidden
          />
          <span className="relative text-xl lg:text-2xl">{emoji}</span>
          <span className="relative mt-px text-[9px] text-kiosk-muted lg:text-[10px]">{label}</span>
        </button>
      ))}
    </section>
  );
}
