/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "Bricolage Grotesque Variable", "sans-serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "DM Sans Variable", "Segoe UI", "sans-serif"],
      },
      colors: {
        ink: "hsl(var(--ink) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        chat: "hsl(var(--ink) / <alpha-value>)",
        raised: "hsl(var(--raised) / <alpha-value>)",
        line: "hsl(var(--line) / <alpha-value>)",
        paper: "hsl(var(--paper) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        brand: "hsl(var(--brand) / <alpha-value>)",
        lime: "hsl(var(--lime) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        warn: "hsl(var(--warn) / <alpha-value>)",
      },
      borderRadius: {
        panel: "26px",
        card: "20px",
        pill: "999px",
      },
      boxShadow: {
        float: "0 18px 44px rgba(0,0,0,.46)",
        glow: "0 10px 28px hsl(var(--brand) / .34)",
        soft: "0 8px 24px rgba(0,0,0,.28)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(.9)", opacity: ".7" },
          "70%": { transform: "scale(1.5)", opacity: "0" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        drift: {
          "0%,100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-14px,0)" },
        },
        blink: {
          "0%,92%,100%": { transform: "scaleY(1)" },
          "95%": { transform: "scaleY(.08)" },
        },
        wave: {
          "0%,100%": { transform: "rotate(-12deg)" },
          "50%": { transform: "rotate(28deg)" },
        },
        spin: { to: { transform: "rotate(360deg)" } },
        shake: { "0%,100%": { transform: "rotate(-8deg)" }, "50%": { transform: "rotate(8deg)" } },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.32,.72,0,1) both",
        "scale-in": "scale-in .3s cubic-bezier(.32,.72,0,1) both",
        shimmer: "shimmer 2.4s linear infinite",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
        drift: "drift 7s ease-in-out infinite",
        blink: "blink 3.6s ease-in-out infinite",
        wave: "wave 1.8s ease-in-out infinite",
        spin: "spin 8s linear infinite",
      },
    },
  },
  plugins: [],
};
