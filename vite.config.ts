import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
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
  plugins: [
    {
      name: "process-html-templates",
      closeBundle() {
        // Read the manifest to get the actual hashed filenames
        const manifestPath = resolve(__dirname, "dist/public/.vite/manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

        // Get the actual script paths from the manifest
        const captchaScript = `/public/${manifest["captcha/index.ts"].file}`;
        const manageScript = `/public/${manifest["manage/index.ts"].file}`;

        // Process captcha.html template
        const captchaTemplate = readFileSync(
          resolve(__dirname, "src/frontend/captcha.html"),
          "utf-8",
        );
        const captchaHtml = captchaTemplate.replace("{{CAPTCHA_SCRIPT}}", captchaScript);
        writeFileSync(resolve(__dirname, "dist/public/captcha.html"), captchaHtml);

        // Process manage.html template
        const manageTemplate = readFileSync(
          resolve(__dirname, "src/frontend/manage.html"),
          "utf-8",
        );
        const manageHtml = manageTemplate.replace("{{MANAGE_SCRIPT}}", manageScript);
        writeFileSync(resolve(__dirname, "dist/public/manage.html"), manageHtml);

        // Copy CSS files
        const cssFiles = ["captcha.css", "manage.css"];
        for (const file of cssFiles) {
          copyFileSync(
            resolve(__dirname, "src/frontend", file),
            resolve(__dirname, "dist/public", file),
          );
        }
      },
    },
  ],
});
