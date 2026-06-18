export default function TipMessage({ hasGender }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-200/90 bg-amber-50/95 px-2 py-1.5 text-[9px] leading-relaxed text-amber-950/90 shadow-sm lg:rounded-xl lg:px-2.5 lg:py-2 lg:text-[10px]">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-14 w-14 rounded-full bg-amber-200/40 blur-xl"
        aria-hidden
      />
      <div className="relative flex gap-2">
        <span
          className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-kiosk-mode-warm text-[9px] text-white shadow-sm lg:h-4 lg:w-4 lg:text-[10px]"
          aria-hidden
        >
          ★
        </span>
        <div>
          {hasGender ? (
            <p>
              <span className="font-semibold text-amber-900">Tip:</span> tap a thumbnail to preview on the mirror. Use{" "}
              <span className="font-semibold text-kiosk-ink">Try On Outfit</span> when you are ready.
            </p>
          ) : (
            <p>
              <span className="font-semibold text-amber-900">Tip:</span> choose{" "}
              <span className="font-semibold text-kiosk-ink">Men</span> or{" "}
              <span className="font-semibold text-kiosk-ink">Women</span> first to unlock the rail.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
