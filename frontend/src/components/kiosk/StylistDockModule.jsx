import { useCallback, useEffect, useState } from "react";
import { useCatalog } from "../../catalog/CatalogContext";
import { getStylistAdvice } from "../../api/aiApi";
import StylistOutfitCards from "./StylistOutfitCards";

/** Appended so small models return parseable lines (same-line or continuation under each label). */
const STYLIST_REPLY_FORMAT = `

Your reply must contain ONLY these labels (copy spelling exactly). Put text after each colon on that line, or on the next lines, until the next label. No greeting before Style Name and no text after Style Tip.

Style Name:
Outfit Idea:
Colors:
Clothing Items:
Accessories:
Style Tip:

Example (same shape, different content):
Style Name: Evening Guest
Outfit Idea: silk blouse with midi skirt
Colors: navy, champagne
Clothing Items: blouse, skirt, light wrap
Accessories: slim belt
Style Tip: one shine piece, rest matte

Now answer for the user message above using that exact label shape.`;

/** One-tap prompts — match kiosk “quick looks” behavior. */
const QUICK_LOOKS = [
  { label: "Casual", emoji: "👕", prompt: "Casual everyday outfit — simple shirt, bottoms, light layer. No brands." },
  { label: "Party", emoji: "🎉", prompt: "Party outfit — dressy top or dress with clean lines. No brands." },
  { label: "University", emoji: "🎓", prompt: "University campus outfit — relaxed but neat. No brands." },
  { label: "Office", emoji: "💼", prompt: "Office look — formal shirt and trousers, minimal accessories. No brands." },
  { label: "Traditional", emoji: "🧕", prompt: "Traditional wear — kurta or shalwar kameez styling ideas. No brands." },
];

function StylistAvatar({ className = "" }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/25 bg-kiosk-accent shadow-md ${className}`}
      aria-hidden
    >
      <span className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/15" />
      <span className="relative text-base text-white">✨</span>
    </div>
  );
}

/** Expandable retail assistant — expands upward from dock; height is explicit so flex scroll regions work. */
export default function StylistDockModule({
  compact = false,
  aiEnabled = true,
  catalogItems: catalogItemsProp,
  onStylistTryOutfit,
  interactionLocked = false,
}) {
  const { gender, selectedCloth, items: catalogFromCtx } = useCatalog();
  const category = selectedCloth?.category ?? "";
  const railItems = catalogItemsProp ?? catalogFromCtx ?? [];

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!aiEnabled) setExpanded(false);
  }, [aiEnabled]);

  useEffect(() => {
    if (interactionLocked) setExpanded(false);
  }, [interactionLocked]);

  const submitPrompt = useCallback(
    async (rawInput) => {
      const base =
        typeof rawInput === "string"
          ? rawInput.trim()
          : String(rawInput?.sendText ?? "").trim();
      const displayText =
        typeof rawInput === "string"
          ? base
          : String(rawInput?.displayText ?? base).trim();

      if (!base || loading || !aiEnabled || interactionLocked) return;
      const text = /Style Name\s*:/i.test(base) ? base : `${base}${STYLIST_REPLY_FORMAT}`;
      setInput("");
      setMessages((m) => [...m, { role: "user", text: displayText }]);
      setLoading(true);
      try {
        const result = await getStylistAdvice(text, gender ?? undefined, category || undefined);
        setMessages((m) => [...m, { role: "assistant", text: result }]);
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          "Could not reach the stylist. Check VITE_API_BASE_URL.";
        setMessages((m) => [...m, { role: "assistant", text: msg, isError: true }]);
      } finally {
        setLoading(false);
      }
    },
    [loading, gender, category, aiEnabled, interactionLocked]
  );

  const onSendClick = () => submitPrompt(input);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitPrompt(input);
    }
  };

  const showChat = messages.length > 0 || loading;

  return (
    <div className="relative flex shrink-0 flex-col items-end overflow-visible">
      {expanded && aiEnabled ? (
        <div
          className="kiosk-stylist-panel-sheen absolute bottom-[calc(100%+0.625rem)] right-0 z-[280] flex h-[min(34rem,calc(100dvh-9.5rem))] min-h-[24rem] w-[min(calc(100vw-1.25rem),26rem)] flex-col overflow-hidden rounded-[1.35rem] border border-slate-300/90 bg-white text-kiosk-ink shadow-2xl shadow-slate-900/15 ring-1 ring-white/60"
          role="dialog"
          aria-label="Fashion assistant"
        >
          <div className="relative z-10 shrink-0 border-b border-slate-200/90 bg-gradient-to-r from-slate-100/95 via-violet-50/50 to-white px-3.5 py-3.5 text-kiosk-ink shadow-kiosk-inset">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_100%_at_100%_-30%,rgba(255,255,255,0.28),transparent_55%)]"
              aria-hidden
            />
            <div className="relative flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <StylistAvatar className="h-10 w-10" />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-serif text-[14px] font-bold leading-tight tracking-tight text-kiosk-ink">
                    In-store stylist
                  </p>
                  <p className="text-[10px] font-medium leading-snug text-kiosk-muted">
                    Rail pairing · <span className="font-semibold text-kiosk-ink">kiosk mode</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-kiosk-border bg-white px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-kiosk-muted">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kiosk-info/30" />
                        <span className="relative rounded-full bg-kiosk-info shadow-sm" />
                      </span>
                      In-store AI
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-kiosk-border bg-white text-sm font-light text-kiosk-ink transition hover:bg-kiosk-layer"
                aria-label="Close assistant"
              >
                −
              </button>
            </div>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-slate-50/95 via-slate-100/50 to-slate-100/80">
            {showChat ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 scrollbar-hide">
                {messages.map((msg, i) => (
                  <div
                    key={`${msg.role}-${i}`}
                    className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <span className="px-1 text-[8px] font-bold uppercase tracking-[0.14em] text-kiosk-subtle">
                      {msg.role === "user" ? "You" : "Stylist"}
                    </span>
                    <div
                      className={`max-w-[96%] rounded-2xl px-3 py-2.5 text-[11px] leading-relaxed shadow-md sm:text-[12px] ${
                        msg.role === "user"
                          ? "rounded-br-md border border-white/30 bg-kiosk-primary text-white shadow-md"
                          : msg.isError
                            ? "rounded-bl-md border border-kiosk-warn/40 bg-kiosk-warn/10 text-kiosk-warn"
                            : "rounded-bl-md border border-kiosk-border bg-white text-kiosk-ink shadow-sm"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="line-clamp-6 text-[11px] leading-snug">{msg.text}</p>
                      ) : (
                        <StylistOutfitCards
                          text={msg.text}
                          catalogItems={railItems}
                          gender={gender}
                          onTryThisOutfit={onStylistTryOutfit}
                          isError={msg.isError}
                        />
                      )}
                    </div>
                  </div>
                ))}
                {loading ? (
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="px-1 text-[8px] font-bold uppercase tracking-[0.14em] text-kiosk-subtle">
                      Stylist
                    </span>
                    <div className="rounded-2xl rounded-bl-md border border-kiosk-border bg-white px-3 py-2.5 text-[11px] font-medium text-kiosk-accent shadow-sm">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex gap-0.5">
                          <span className="h-1 w-1 animate-bounce rounded-full bg-kiosk-accent [animation-delay:-0.2s]" />
                          <span className="h-1 w-1 animate-bounce rounded-full bg-kiosk-accent-hot/80 [animation-delay:-0.1s]" />
                          <span className="h-1 w-1 animate-bounce rounded-full bg-kiosk-brand/70" />
                        </span>
                        <span>Composing your edit…</span>
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-4 scrollbar-hide">
                <div className="rounded-xl border border-slate-200/90 bg-white px-3 py-3 shadow-md shadow-slate-900/5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-violet-600">Welcome in</p>
                  <p className="mt-1.5 font-serif text-[15px] font-semibold leading-snug text-kiosk-ink">
                    Curated advice for the mirror
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-kiosk-muted">
                    Ask for silhouettes, color stories, or what to pair with your rail pick — tailored to this session.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="relative z-10 shrink-0 border-t border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-2.5">
            <p className="mb-1.5 px-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-kiosk-subtle">
              Quick looks
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_LOOKS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={loading || !aiEnabled || interactionLocked}
                  onClick={() =>
                    submitPrompt({
                      sendText: q.prompt,
                      displayText: `${q.label} ${q.emoji}`,
                    })
                  }
                  className="shrink-0 rounded-full border border-kiosk-border bg-white px-2.5 py-1.5 text-[10px] font-semibold text-kiosk-ink transition hover:border-kiosk-accent/40 hover:bg-kiosk-canvas disabled:opacity-50"
                >
                  {q.label} <span aria-hidden>{q.emoji}</span>
                </button>
              ))}
            </div>
            <div className="flex items-stretch gap-2 rounded-2xl border border-slate-200/95 bg-white p-1 pl-3 shadow-inner shadow-slate-900/5">
              <label className="sr-only" htmlFor="kiosk-stylist-input">
                Message stylist
              </label>
              <input
                id="kiosk-stylist-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading || !aiEnabled || interactionLocked}
                className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-[12px] text-kiosk-ink outline-none placeholder:text-kiosk-subtle"
                placeholder="Ask for a look…"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={onSendClick}
                disabled={loading || !input.trim() || !aiEnabled || interactionLocked}
                className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full bg-kiosk-accent text-sm font-semibold text-white shadow-md ring-2 ring-white/30 transition hover:brightness-110 disabled:opacity-50"
                aria-label="Send"
              >
                ↑
              </button>
            </div>
            <p className="mt-1.5 px-1 text-center text-[8px] text-kiosk-muted">
              Private to this kiosk · powered by your local Ollama stylist
            </p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (!aiEnabled || interactionLocked) return;
          setExpanded((e) => !e);
        }}
        disabled={!aiEnabled || interactionLocked}
        className={`kiosk-stylist-launch relative flex items-center gap-2 overflow-hidden rounded-full border border-white/35 bg-kiosk-accent font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${
          compact ? "px-4 py-2 text-[10px]" : "px-5 py-2.5 text-[11px] sm:text-xs"
        }`}
        aria-expanded={expanded && aiEnabled}
      >
        <span aria-hidden>✨</span>
        <span>Stylist</span>
      </button>
    </div>
  );
}
