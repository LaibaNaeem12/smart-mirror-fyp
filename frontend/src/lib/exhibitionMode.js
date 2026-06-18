/** Raw env value (string). Changes only after Vite rebuild / env reload — used to reset try-on UI if the flag flips in dev. */
export const EXHIBITION_MODE_ENV = String(import.meta.env?.VITE_EXHIBITION_MODE ?? "true").trim();

export const EXHIBITION_MODE = EXHIBITION_MODE_ENV === "true";

