/** Dhiti Marketing Studio design tokens. Colours resolve to CSS variables (src/index.css) so light/dark swap. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: v("brand"), deep: v("brand-deep"), bright: v("brand-bright"), tint: v("brand-tint"), ink: v("brand-ink") },
        ink: { DEFAULT: v("ink"), soft: v("ink-soft"), mute: v("ink-mute"), faint: v("ink-faint") },
        canvas: v("canvas"),
        surface: { DEFAULT: v("surface"), raised: v("surface-raised"), sunken: v("surface-sunken") },
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        ok: v("ok"),
        warn: v("warn"),
        info: v("info"),
        violet: v("violet"),
      },
      fontFamily: {
        // SF Pro Display everywhere (@font-face in src/index.css, owner-supplied OTFs in public/fonts/), then the system SF.
        sans: ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      // Licensed faces: 400, 500, 700. Semibold maps to Medium so 600 never silently renders as Bold; 700 is kept for
      // page titles, headings and numbers. (Add a 600 face in src/index.css and remove this to use a real Semibold.)
      fontWeight: { semibold: "500" },
      fontSize: {
        // SF-style scale: [size, {lineHeight, letterSpacing}]
        "title-l": ["34px", { lineHeight: "41px", letterSpacing: "-0.026em" }],
        "title-1": ["28px", { lineHeight: "34px", letterSpacing: "-0.022em" }],
        "title-2": ["22px", { lineHeight: "28px", letterSpacing: "-0.018em" }],
        headline: ["17px", { lineHeight: "22px", letterSpacing: "-0.012em" }],
        body: ["15px", { lineHeight: "21px", letterSpacing: "-0.006em" }],
        callout: ["13px", { lineHeight: "18px", letterSpacing: "-0.002em" }],
        caption: ["11px", { lineHeight: "13px", letterSpacing: "0.01em" }],
      },
      borderRadius: { xl: "12px", "2xl": "16px", "3xl": "22px" },
      boxShadow: {
        hair: "0 0 0 1px rgb(var(--line) / 1)",
        card: "0 0 0 1px rgb(var(--line) / 0.9), 0 1px 2px rgb(var(--shadow) / 0.04), 0 2px 6px -2px rgb(var(--shadow) / 0.06)",
        lift: "0 0 0 1px rgb(var(--line) / 0.9), 0 2px 4px rgb(var(--shadow) / 0.04), 0 12px 32px -8px rgb(var(--shadow) / 0.16)",
        pop: "0 0 0 1px rgb(var(--line-strong) / 0.6), 0 8px 16px -4px rgb(var(--shadow) / 0.12), 0 32px 64px -16px rgb(var(--shadow) / 0.28)",
        glow: "0 1px 0 rgb(255 255 255 / 0.18) inset, 0 0 0 1px rgb(var(--brand-deep) / 1), 0 1px 2px rgb(var(--brand-deep) / 0.4), 0 6px 16px -6px rgb(var(--brand) / 0.55)",
      },
      transitionTimingFunction: { apple: "cubic-bezier(0.32, 0.72, 0, 1)" },
      screens: { xs: "420px", "3xl": "1680px" },
    },
  },
  plugins: [],
};
