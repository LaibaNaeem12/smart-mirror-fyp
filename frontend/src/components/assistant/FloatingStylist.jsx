import { useCallback, useState } from "react";
import { useCatalog } from "../../catalog/CatalogContext";
import { getStylistAdvice } from "../../api/aiApi";

function StylistAvatar({ className = "" }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/25 bg-kiosk-accent shadow-md ${className}`}
      aria-hidden
    >
      <span className="absolute inset-0 bg-gradient-to-t from-black/20 to-white/15" />
      <span className="relative text-base text-white sm:text-lg">✨</span>
    </div>
  );
}

/**
 * Collapsible AI stylist dock — bottom-right, avoids covering the main mirror flow.
 */
export default function FloatingStylist() {
  const { gender, selectedCloth } = useCatalog();
  const category = selectedCloth?.category ?? "";

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);

    try {
      const result = await getStylistAdvice(text, gender ?? undefined, category || undefined);
      setMessages((m) => [...m, { role: "assistant", text: result }]);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Could not reach the stylist. Check that the API is running and VITE_API_BASE_URL is set.";
      setMessages((m) => [...m, { role: "assistant", text: msg, isError: true }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, gender, category]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const showChat = messages.length > 0 || loading;

  return (
    <section
      className="pointer-events-none fixed bottom-24 right-2 z-[180] sm:bottom-28 sm:right-4"
      aria-label="AI Fashion Stylist"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2">
        {expanded ? (
          <div className="flex max-h-[min(46vh,20rem)] w-[min(calc(100vw-1.25rem),18rem)] flex-col overflow-hidden rounded-2xl border border-kiosk-border bg-white shadow-kiosk-float sm:rounded-[1.35rem]">
            <div className="flex items-center justify-between gap-2 border-b border-kiosk-border bg-kiosk-layer px-2.5 py-2 text-kiosk-ink">
              <div className="flex min-w-0 items-center gap-2">
                <StylistAvatar className="h-8 w-8" />
                <div className="min-w-0">
                  <p className="truncate font-serif text-[11px] font-bold lg:text-xs">AI Stylist</p>
                  <p className="truncate text-[9px] text-kiosk-muted">Suggestions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-kiosk-border bg-white text-sm text-kiosk-ink transition hover:bg-kiosk-layer"
                aria-label="Collapse stylist"
              >
                −
              </button>
            </div>

            {showChat ? (
              <div
                className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-2"
                aria-label="Stylist conversation"
              >
                {messages.map((msg, i) => (
                  <div
                    key={`${msg.role}-${i}`}
                    className={`rounded-xl border px-2.5 py-1.5 text-[10px] leading-relaxed shadow-sm sm:text-[11px] ${
                      msg.role === "user"
                        ? "ml-2 border-kiosk-border bg-kiosk-layer text-kiosk-ink"
                        : msg.isError
                          ? "mr-2 border-red-200 bg-red-50 text-red-900"
                          : "mr-2 border-kiosk-border bg-white text-kiosk-ink"
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
                {loading ? (
                  <p className="mr-2 rounded-xl border border-kiosk-border bg-kiosk-layer px-2.5 py-1.5 text-[10px] font-medium text-kiosk-accent">
                    Stylist is thinking…
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-1.5 border-t border-kiosk-border bg-kiosk-layer p-2">
              <label className="sr-only" htmlFor="ai-stylist-input-dock">
                Message to AI stylist
              </label>
              <input
                id="ai-stylist-input-dock"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                className="min-w-0 flex-1 rounded-xl border border-kiosk-border bg-white px-2.5 py-2 text-[11px] text-kiosk-ink outline-none ring-kiosk-accent/20 placeholder:text-kiosk-subtle focus:ring-2 sm:text-xs"
                placeholder="Ask for styling tips…"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={send}
                disabled={loading || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kiosk-accent text-sm text-white shadow-md ring-1 ring-white/25 transition hover:brightness-110 disabled:opacity-50"
                aria-label="Send"
              >
                ➤
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="kiosk-stylist-launch flex items-center gap-2 rounded-full border border-white/35 bg-kiosk-accent px-4 py-2.5 text-[11px] font-bold tracking-tight text-white transition hover:brightness-110 sm:px-5 sm:text-xs"
          aria-expanded={expanded}
          aria-label={expanded ? "Close stylist panel" : "Open AI stylist"}
        >
          <span aria-hidden>✨</span>
          <span>AI Stylist</span>
        </button>
      </div>
    </section>
  );
}
