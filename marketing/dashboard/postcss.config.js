// Local config so PostCSS never picks up the website's config from the repo root.
export default {
  plugins: {
    tailwindcss: { config: new URL("./tailwind.config.js", import.meta.url).pathname },
    autoprefixer: {},
  },
};
