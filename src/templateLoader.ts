import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

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
   * Render the captcha page with the provided data.
   */
  renderCaptchaPage(data: {
    challenge: { c: number; s: number; d: number };
    signature: string;
    userId: string;
    fileId: string;
  }): string {
    const html = this.load("captcha.html");
    const css = this.load("captcha.css");
    const script = this.load("captcha.js");

    return html
      .replace("{{STYLES}}", css)
      .replace(
        "{{SCRIPT}}",
        script
          .replace("{{CHALLENGE}}", JSON.stringify(data.challenge))
          .replace("{{SIGNATURE}}", JSON.stringify(data.signature))
          .replace("{{USER_ID}}", JSON.stringify(data.userId))
          .replace("{{FILE_ID}}", JSON.stringify(data.fileId)),
      );
  }
}

export const templateLoader = new TemplateLoader();
