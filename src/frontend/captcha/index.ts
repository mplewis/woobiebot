import type { CaptchaPageData } from "../../shared/types.js";
import { solveCaptcha } from "./crypto.js";
import { extractFilenameFromHeader, triggerBrowserDownload } from "./download.js";

/**
 * Fetches captcha data from the API using parameters from the URL query string.
 */
async function fetchCaptchaData(): Promise<CaptchaPageData> {
  const params = new URLSearchParams(window.location.search);
  const response = await fetch(`/api/captcha-data?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to load captcha data");
  }

  return await response.json();
}

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
 * @param captchaData - The captcha challenge data from the API
 * @param solution - Array of nonces that solve the challenges
 */
async function submitSolution(captchaData: CaptchaPageData, solution: number[]): Promise<void> {
  try {
    hideProgress();
    setStatus("Verifying solution...", "info");

    const response = await fetch("/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: captchaData.userId,
        fileId: captchaData.fileId,
        token: captchaData.token,
        challenge: JSON.stringify(captchaData.challenge),
        signature: captchaData.signature,
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
    setStatus("Loading challenge...", "info");
    const captchaData = await fetchCaptchaData();

    setStatus("Solving challenge...", "info");
    const solutions = await solveCaptcha(captchaData.token, captchaData.challenge, setProgress);

    setStatus("Challenge solved! Verifying...", "info");
    await submitSolution(captchaData, solutions);
  } catch (error) {
    console.error("Failed to solve captcha challenge:", error);
    setStatus(
      `Failed to solve challenge: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
  }
})();
