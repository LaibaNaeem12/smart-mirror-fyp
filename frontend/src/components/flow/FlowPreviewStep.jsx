import { useState, useCallback } from "react";

/**
 * Large outfit hero in the mirror stage — primary CTAs live here (single-screen kiosk flow).
 * @param {boolean} [exhibitionHints] — first session: reassurance line under actions
 */
function outfitBlurb(item, gender) {
  const g = gender === "women" ? "women's" : gender === "men" ? "men's" : "in-store";
  const cat = item?.category?.trim();
  const tags = Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [];
  if (tags.length > 0) {
    const bit = tags.slice(0, 2).join(" · ");
    return `${bit} — a considered ${cat ? `${cat.toLowerCase()} ` : ""}piece from our ${g} edit, styled for the mirror.`;
  }
  if (cat) {
    return `A refined ${cat.toLowerCase()} silhouette — composed for this glass so you can see the line and proportion before you try it on.`;
  }
  return "A boutique pick — preview it here at full scale, then step into try-on when the look feels right.";
}

export default function FlowPreviewStep({ item, gender, exhibitionHints = false, onTryOnOutfit, onChangeOutfit }) {
  const src = item?.imageUrl || item?.image;
  const name = item?.name || "Selected look";
  const category = item?.category || "";
  const blurb = outfitBlurb(item, gender);
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const [secondaryBusy, setSecondaryBusy] = useState(false);

  const handleTryOn = useCallback(() => {
    if (primaryBusy) return;
    setPrimaryBusy(true);
    window.setTimeout(() => setPrimaryBusy(false), 900);
    onTryOnOutfit?.();
  }, [primaryBusy, onTryOnOutfit]);

  const handleChange = useCallback(() => {
    if (secondaryBusy) return;
    setSecondaryBusy(true);
    window.setTimeout(() => setSecondaryBusy(false), 600);
    onChangeOutfit?.();
  }, [secondaryBusy, onChangeOutfit]);

  return (
    <section className="kiosk-mirror-stage relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-kiosk-border bg-white shadow-kiosk-card lg:rounded-[1.5rem]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_8%,rgba(37,99,235,0.06),transparent_58%),radial-gradient(ellipse_45%_40%_at_100%_100%,rgba(14,165,233,0.04),transparent)]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-5 sm:py-4 lg:px-8 lg:py-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-5 lg:flex-row lg:items-stretch lg:gap-10">
          <div className="mirror-frame-glow flex min-h-[min(38dvh,16rem)] w-full max-w-[min(94vw,24rem)] flex-1 lg:min-h-0 lg:max-w-[min(48vw,min(28rem,62dvh))]">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.15rem] border border-kiosk-border bg-kiosk-layer shadow-kiosk-inset lg:rounded-[1.3rem]">
              <div className="relative min-h-0 flex-1 bg-white">
                {src ? (
                  <img
                    src={src}
                    alt={name}
                    className="h-full w-full object-contain object-center transition-opacity duration-700 ease-out"
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex w-full max-w-md shrink-0 flex-col items-center justify-center gap-4 text-center lg:max-w-sm lg:items-start lg:text-left">
            {category ? (
              <span className="rounded-full border border-kiosk-border bg-kiosk-layer px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-kiosk-accent sm:text-[11px]">
                {category}
              </span>
            ) : null}
            <h2 className="font-serif text-2xl font-bold leading-tight tracking-tight text-kiosk-ink sm:text-3xl lg:text-[2.1rem]">
              {name}
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-kiosk-muted sm:text-[15px] lg:text-base">{blurb}</p>
            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <button
                type="button"
                onClick={handleTryOn}
                disabled={primaryBusy}
                aria-busy={primaryBusy}
                className="kiosk-glow-btn rounded-2xl bg-kiosk-primary px-8 py-4 text-base font-bold text-white shadow-kiosk-float transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-80 sm:min-h-[3.25rem] sm:px-10 sm:text-lg lg:py-[1.125rem]"
              >
                Try your look
              </button>
              <button
                type="button"
                onClick={handleChange}
                disabled={secondaryBusy}
                aria-busy={secondaryBusy}
                className="rounded-2xl border border-kiosk-border bg-white px-8 py-4 text-base font-semibold text-kiosk-ink shadow-sm transition duration-200 hover:border-kiosk-accent/40 hover:bg-kiosk-layer active:scale-[0.98] disabled:pointer-events-none disabled:opacity-80 sm:min-h-[3.25rem] sm:px-10 sm:text-[15px] lg:py-[1.125rem]"
              >
                Choose another outfit
              </button>
            </div>
            {exhibitionHints ? (
              <p className="mt-1 max-w-md text-xs leading-relaxed text-kiosk-subtle sm:text-[13px] lg:text-left">
                Private to this mirror — your try-on is composed here, in one calm sequence.
              </p>
            ) : (
              <p className="mt-1 max-w-md text-xs leading-relaxed text-kiosk-subtle sm:text-[13px] lg:text-left">
                Preview, capture, then see your styled look — composed for this glass only.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
