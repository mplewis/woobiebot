import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Structure of the Vite build manifest containing output file mappings.
 */
interface ViteManifest {
  [key: string]: {
    file: string;
    src?: string;
    isEntry?: boolean;
  };
}

/**
 * Cached Vite manifest to avoid repeated file system reads.
 */
let manifestCache: ViteManifest | null = null;

/**
 * Load and cache the Vite build manifest from disk.
 * @returns The parsed manifest object, or null if the manifest file doesn't exist
 */
function loadManifest(): ViteManifest | null {
  if (manifestCache !== null) {
    return manifestCache;
  }

  const manifestPath = join(__dirname, "public", ".vite", "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }

  const manifestContent = readFileSync(manifestPath, "utf-8");
  manifestCache = JSON.parse(manifestContent) as ViteManifest;
  return manifestCache;
}

/**
 * Resolve the bundled script path for a given frontend entry point.
 * @param entryName - Name of the frontend entry (e.g., "captcha", "manage")
 * @returns The public path to the bundled script file
 */
function getScriptPath(entryName: string): string {
  const manifest = loadManifest();
  if (!manifest) {
    return `/public/assets/${entryName}.js`;
  }

  const entry = manifest[`${entryName}/index.ts`];
  if (!entry) {
    return `/public/assets/${entryName}.js`;
  }
  return `/public/${entry.file}`;
}

/**
 * Load and cache template files.
 */
class TemplateLoader {
  private readonly cache = new Map<string, string>();

  /**
   * Load a template file from the templates directory.
   */
  load(filename: string): string {
    if (this.cache.has(filename)) {
      return this.cache.get(filename) as string;
    }

    const path = join(__dirname, "..", "templates", filename);
    const content = readFileSync(path, "utf-8");
    this.cache.set(filename, content);
    return content;
  }

  /**
   * Render the captcha page with URL parameters for API data fetching.
   */
  renderCaptchaPage(data: {
    userId: string;
    fileId: string;
    token: string;
    signature: string;
    expiresAt: string;
  }): string {
    const html = this.load("captcha.html");
    const css = this.load("captcha.css");
    const scriptSrc = getScriptPath("captcha");

    const apiParams = new URLSearchParams({
      userId: data.userId,
      fileId: data.fileId,
      token: data.token,
      sig: data.signature,
      expiresAt: data.expiresAt,
    });

    return html
      .replace("{{STYLES}}", css)
      .replace("{{API_PARAMS}}", apiParams.toString())
      .replace("{{SCRIPT_SRC}}", scriptSrc);
  }

  /**
   * Render the file management page with URL parameters for API data fetching.
   */
  renderManagePage(data: { userId: string; signature: string; expiresAt: string }): string {
    const html = this.load("manage.html");
    const css = this.load("manage.css");
    const scriptSrc = getScriptPath("manage");

    const apiParams = new URLSearchParams({
      userId: data.userId,
      signature: data.signature,
      expiresAt: data.expiresAt,
    });

    return html
      .replace("{{STYLES}}", css)
      .replace("{{API_PARAMS}}", apiParams.toString())
      .replace("{{SCRIPT_SRC}}", scriptSrc);
  }
}

/**
 * Global singleton instance for loading and rendering HTML templates.
 */
export const templateLoader = new TemplateLoader();
