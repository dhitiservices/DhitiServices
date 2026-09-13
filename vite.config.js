import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset paths relative so the built `dist` works
// whether it's hosted at a domain root, a sub-path, or opened locally.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Split the big, rarely-changing libraries into their own files so that
    // returning visitors only re-download the site code, not React/animation.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
    cssMinify: true,
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 700,
  },
});
