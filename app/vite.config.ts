import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        previews: resolve(import.meta.dirname, "previews.html"),
      },
    },
  },
});
