import { useMemo } from "react";
import { parseStylistOutfits } from "../../utils/parseStylistOutfits";
import { matchCatalogForOutfit } from "../../utils/matchStylistCatalog";

function Field({ label, value, muted }) {
  if (!value) return null;
  return (
    <div className={muted ? "text-kiosk-muted" : ""}>
      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-kiosk-accent">{label}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-kiosk-ink">{value}</p>
    </div>
  );
}

/**
 * Renders one or more outfit cards + optional catalog thumbnails + try-on CTA.
 */
export default function StylistOutfitCards({ text, catalogItems, gender, onTryThisOutfit, isError }) {
  const outfits = useMemo(() => parseStylistOutfits(text).slice(0, 3), [text]);

  if (isError) {
    return (
      <p className="line-clamp-6 text-[11px] leading-relaxed text-kiosk-warn">{text}</p>
    );
  }

  if (!outfits.length) {
    return (
      <p className="text-[11px] leading-snug text-kiosk-muted">
        No look cards for this reply. Use <span className="font-medium text-kiosk-ink">Quick looks</span> or ask again in
        a short outfit format.
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-full flex-col gap-2.5">
      {outfits.map((outfit, idx) => {
        const matches = matchCatalogForOutfit(outfit, catalogItems, gender, 3);
        const primary = matches[0] ?? null;

        return (
          <article
            key={`outfit-${idx}-${outfit.styleName || idx}`}
            className="overflow-hidden rounded-2xl border border-kiosk-border bg-white shadow-kiosk-card"
          >
            <div className="border-b border-kiosk-border bg-kiosk-layer px-3 py-2">
              <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-kiosk-subtle">Look</p>
              <p className="font-serif text-[13px] font-bold leading-tight text-kiosk-ink line-clamp-2">
                {outfit.styleName}
              </p>
            </div>
            <div className="space-y-2 px-3 py-2.5">
              <Field label="Outfit idea" value={outfit.outfitIdea} />
              <Field label="Colors" value={outfit.colors} />
              <Field label="Clothing items" value={outfit.clothingItems} />
              {(outfit.accessories || outfit.styleTip) && (
                <div className="grid gap-2 border-t border-kiosk-border pt-2 sm:grid-cols-2">
                  <Field label="Accessories" value={outfit.accessories} muted />
                  <Field label="Style tip" value={outfit.styleTip} muted />
                </div>
              )}

              {matches.length > 0 ? (
                <div className="border-t border-kiosk-border pt-2">
                  <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-kiosk-subtle">From your rail</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {matches.map((it) => (
                      <div
                        key={String(it._id ?? it.id)}
                        className="h-12 w-10 shrink-0 overflow-hidden rounded-lg border border-kiosk-border bg-kiosk-layer"
                        title={it.name}
                      >
                        {(it.imageUrl || it.image) && (
                          <img
                            src={it.imageUrl || it.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                disabled={!primary}
                onClick={() => primary && onTryThisOutfit?.(primary)}
                className="kiosk-glow-btn mt-1 w-full rounded-xl border border-white/25 bg-kiosk-primary py-2 text-[11px] font-bold text-white shadow-kiosk-float transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {primary ? "Try this outfit" : "Browse rail to match"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
