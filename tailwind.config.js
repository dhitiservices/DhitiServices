/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#EE0800", deep: "#C20600", bright: "#FF3322" },
        ink: { DEFAULT: "#15161A", soft: "#3a3d45", mute: "#6b6f7a" },
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"Space Grotesk"', "monospace"],
      },
    },
  },
  plugins: [],
};
