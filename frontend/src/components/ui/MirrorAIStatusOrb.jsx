import { memo } from "react";

/**
 * Wordless spatial status — color + motion only (Vision Pro–style cue).
 * @param {"idle" | "processing" | "finalizing" | "complete"} tone
 */
function MirrorAIStatusOrb({ tone = "idle" }) {
  const safe = "pointer-events-none absolute right-5 top-5 z-[40] sm:right-6 sm:top-6";
  return (
    <div className={safe} aria-hidden>
      <span className={`mirror-ai-orb mirror-ai-orb--${tone}`} />
      <span className="sr-only">
        {tone === "idle"
          ? "Mirror idle"
          : tone === "complete"
            ? "Look ready"
            : tone === "finalizing"
              ? "Refining look"
              : "Applying look"}
      </span>
    </div>
  );
}

export default memo(MirrorAIStatusOrb);
