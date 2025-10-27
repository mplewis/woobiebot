import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/frontend",
  build: {
    outDir: "../../dist/public",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        captcha: resolve(__dirname, "src/frontend/captcha/index.ts"),
        manage: resolve(__dirname, "src/frontend/manage/index.ts"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    manifest: true,
  },
});
