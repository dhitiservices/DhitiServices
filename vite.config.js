import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset paths relative so the built `dist` works
// whether it's hosted at a domain root, a sub-path, or opened locally.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
