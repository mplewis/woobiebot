import type { CaptchaPageData } from "../../shared/types.js";
import { solveCaptcha } from "./crypto.js";
import { extractFilenameFromHeader, triggerBrowserDownload } from "./download.js";

declare global {
  interface Window {
    __CAPTCHA_DATA__: CaptchaPageData;
  }
}

/**
 * Captcha challenge data injected by the server into the page.
 */
const { challenge, token, signature, userId, fileId } = window.__CAPTCHA_DATA__;

/**
 * Status message display element.
 */
const statusDiv = document.getElementById("status") as HTMLDivElement;

/**
 * Progress bar container element.
 */
const progressContainer = document.getElementById("progress-container") as HTMLDivElement;

/**
 * Progress bar fill element.
 */
const progressBar = document.getElementById("progress-bar") as HTMLDivElement;

/**
 * Updates the status message display with the given message and type.
 * The status element will be shown with appropriate styling based on the type.
 *
 * @param message - The status message to display
 * @param type - The status type determining the visual style
 */
function setStatus(message: string, type: "info" | "error" | "success" = "info"): void {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = "block";
  statusDiv.setAttribute("role", "status");
  statusDiv.setAttribute("aria-live", "polite");
}

/**
 * Updates the progress bar to show completion percentage.
 *
 * @param current - Number of completed items
 * @param total - Total number of items
 */
function setProgress(current: number, total: number): void {
  const percent = Math.round((current / total) * 100);
  progressBar.style.width = `${percent}%`;
  progressBar.setAttribute("aria-valuenow", percent.toString());
  progressBar.setAttribute("aria-valuemin", "0");
  progressBar.setAttribute("aria-valuemax", "100");
  progressContainer.style.display = "block";
}

/**
 * Hides the progress bar from view.
 */
function hideProgress(): void {
  progressContainer.style.display = "none";
}

/**
 * Submits the captcha solution to the server for verification.
 * On success, extracts the filename from response headers and triggers a download.
 *
 * @param solution - Array of nonces that solve the challenges
 */
async function submitSolution(solution: number[]): Promise<void> {
  try {
    hideProgress();
    setStatus("Verifying solution...", "info");

    const response = await fetch("/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        fileId,
        token,
        challenge: JSON.stringify(challenge),
        signature,
        solution: solution.join(","),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Sorry, something went wrong");
    }

    setStatus("Verification successful! Downloading...", "success");

    const contentDisposition = response.headers.get("Content-Disposition");
    const filename = extractFilenameFromHeader(contentDisposition);

    const blob = await response.blob();
    triggerBrowserDownload(blob, filename);
    setStatus("Download complete! You can close this window.", "success");
  } catch (error) {
    console.error("Verification error:", error);
    setStatus(
      `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
    hideProgress();
  }
}

(async () => {
  try {
    setStatus("Solving challenge...", "info");
    const solutions = await solveCaptcha(token, challenge, setProgress);

    setStatus("Challenge solved! Verifying...", "info");
    await submitSolution(solutions);
  } catch (error) {
    console.error("Failed to solve captcha challenge:", error);
    setStatus(
      `Failed to solve challenge: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
  }
})();
