import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Demo mode (fixture data, no Supabase) is compiled in ONLY for `vite dev` or when VITE_DEMO=1.
// In a normal production build __DEMO__ is the literal `false`, so the fixtures chunk is never emitted.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const demo = command === "serve" || env.VITE_DEMO === "1" || process.env.VITE_DEMO === "1";
  return {
    plugins: [react()],
    define: { __DEMO__: JSON.stringify(demo) },
    build: {
      target: "es2020",
      sourcemap: false,
      cssMinify: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            motion: ["framer-motion"],
            supabase: ["@supabase/supabase-js"],
          },
        },
      },
    },
    server: { port: 5174 },
    preview: { port: 4174 },
  };
});
