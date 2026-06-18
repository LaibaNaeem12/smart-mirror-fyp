/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ['"Instrument Serif"', "Georgia", "serif"],
      },
      colors: {
        kiosk: {
          canvas: "#EEF2F7",
          "canvas-peach": "#F1F0F9",
          layer: "#E8ECF3",
          surface: "#FFFFFF",
          border: "#CBD5E1",
          ink: "#1E1B4B",
          muted: "#64748B",
          subtle: "#94A3B8",
          brand: "#EC4899",
          "brand-strong": "#EA580C",
          accent: "#8B5CF6",
          "accent-hot": "#D946EF",
          success: "#16A34A",
          warn: "#F59E0B",
          err: "#EF4444",
          info: "#3B82F6",
          "mode-indigo": "#6366F1",
        },
      },
      backgroundImage: {
        "kiosk-primary":
          "linear-gradient(135deg, #F97316 0%, #EC4899 52%, #F472B6 100%)",
        "kiosk-accent":
          "linear-gradient(135deg, #6D28D9 0%, #7C3AED 42%, #8B5CF6 78%, #A78BFA 100%)",
        "kiosk-mode-blue": "linear-gradient(90deg, #3B82F6 0%, #6366F1 100%)",
        "kiosk-mode-warm": "linear-gradient(90deg, #FBBF24 0%, #F97316 40%, #EF4444 100%)",
      },
      boxShadow: {
        "kiosk-card":
          "0 1px 3px rgba(49, 46, 129, 0.06), 0 8px 24px rgba(49, 46, 129, 0.08)",
        "kiosk-float": "0 4px 16px rgba(217, 70, 239, 0.12), 0 2px 6px rgba(15, 23, 42, 0.06)",
        "kiosk-dock": "0 -8px 32px rgba(15, 23, 42, 0.12)",
        "kiosk-inset": "inset 0 1px 0 rgba(255, 255, 255, 0.92)",
        "stylist-launch":
          "0 4px 22px rgba(109, 40, 217, 0.38), 0 2px 8px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255,255,255,0.25)",
      },
    },
  },
  plugins: [],
};
