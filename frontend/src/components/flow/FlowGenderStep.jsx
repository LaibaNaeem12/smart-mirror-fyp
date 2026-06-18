import { useState, useCallback } from "react";

/**
 * Kiosk landing — animated welcome, premium gender selection.
 */
export default function FlowGenderStep({ onChooseMen, onChooseWomen }) {
  const [committing, setCommitting] = useState(false);

  const goMen = useCallback(() => {
    if (committing) return;
    setCommitting(true);
    onChooseMen?.();
  }, [committing, onChooseMen]);

  const goWomen = useCallback(() => {
    if (committing) return;
    setCommitting(true);
    onChooseWomen?.();
  }, [committing, onChooseWomen]);

  return (
    <section className="kiosk-mirror-stage relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[1.35rem] border border-violet-200/50 bg-gradient-to-br from-white via-violet-50/35 to-rose-50/40 p-6 shadow-kiosk-card lg:rounded-[1.5rem] lg:p-10">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_78%_58%_at_50%_28%,rgba(255,255,255,0.88),transparent_60%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_44%_at_50%_95%,rgba(167,139,250,0.14),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_50%_0%,rgba(251,191,36,0.08),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 top-1/4 h-72 w-72 rounded-full bg-violet-400/14 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-12 bottom-1/4 h-64 w-64 rounded-full bg-rose-400/12 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(80vw,28rem)] w-[min(80vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-200/35 opacity-55"
        aria-hidden
      />
      <div className="kiosk-fade-up relative z-10 max-w-xl text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-violet-600/95 sm:text-[11px]">
          Select a collection to begin
        </p>
        <p className="mt-2 text-xs font-semibold tracking-wide text-violet-700/90 drop-shadow-sm sm:text-[13px]">
          Private smart mirror · touch to start
        </p>
        <h1 className="mt-4 font-serif text-3xl font-bold leading-[1.12] tracking-tight text-kiosk-ink sm:text-4xl lg:text-[2.65rem]">
          Discover looks curated for you
        </h1>
        <p
          className="mt-2 text-xl text-amber-500 drop-shadow-[0_2px_10px_rgba(245,158,11,0.45)] sm:text-2xl"
          aria-hidden
        >
          ✨
        </p>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base lg:text-[1.05rem]">
          Choose <span className="font-semibold text-slate-800">Men&apos;s</span> or{" "}
          <span className="font-semibold text-slate-800">Women&apos;s</span> — then browse the rail, preview on this
          glass, and try your look when the moment feels right. Calm steps, no rush, everything stays on this kiosk.
        </p>

        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:gap-6">
          <button
            type="button"
            onClick={goMen}
            disabled={committing}
            aria-busy={committing}
            aria-label="Open men's collection"
            className="kiosk-choice-card group relative overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-white px-10 py-6 text-lg font-bold tracking-wide text-kiosk-ink shadow-[0_12px_40px_-8px_rgba(14,165,233,0.15)] ring-1 ring-sky-100/90 transition duration-300 hover:-translate-y-1 hover:border-sky-300/90 hover:shadow-[0_20px_44px_-12px_rgba(14,165,233,0.22)] active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70 lg:px-12 lg:py-8 lg:text-xl"
          >
            <span
              className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100"
              style={{
                background: "radial-gradient(ellipse at 50% 0%, rgba(56, 189, 248, 0.22), transparent 58%)",
              }}
              aria-hidden
            />
            <span className="relative flex flex-col items-center gap-1">
              <span>Men&apos;s</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700/90 sm:text-xs">
                Open collection
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={goWomen}
            disabled={committing}
            aria-busy={committing}
            aria-label="Open women's collection"
            className="kiosk-choice-card group relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white to-white px-10 py-6 text-lg font-bold tracking-wide text-kiosk-ink shadow-[0_12px_40px_-8px_rgba(244,114,182,0.16)] ring-1 ring-rose-100/90 transition duration-300 hover:-translate-y-1 hover:border-rose-300/90 hover:shadow-[0_20px_44px_-12px_rgba(244,114,182,0.24)] active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70 lg:px-12 lg:py-8 lg:text-xl"
          >
            <span
              className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100"
              style={{
                background: "radial-gradient(ellipse at 50% 0%, rgba(244, 114, 182, 0.22), transparent 58%)",
              }}
              aria-hidden
            />
            <span className="relative flex flex-col items-center gap-1">
              <span>Women&apos;s</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700/90 sm:text-xs">
                Open collection
              </span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
