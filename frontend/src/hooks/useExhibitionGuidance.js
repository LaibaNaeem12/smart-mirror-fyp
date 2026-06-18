import { useEffect, useState } from "react";

const SESSION_KEY = "kiosk_expo_guidance_done_v1";

/**
 * First-pass exhibition hints: richer guidance until the guest reaches outfit preview once.
 * Persists for the browser tab session only (sessionStorage).
 */
export function useExhibitionGuidance(step, selectedCloth) {
  const [active, setActive] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (step === "preview" && selectedCloth) {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode / storage blocked */
      }
      setActive(false);
    }
  }, [step, selectedCloth]);

  return active;
}
