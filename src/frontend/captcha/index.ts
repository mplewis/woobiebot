import type { CaptchaPageData, Challenge } from "../../shared/types.js";

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
 * Triggers a browser download of a Blob by creating a temporary anchor element.
 * The blob URL and anchor are automatically cleaned up after the download starts.
 *
 * @param blob - The data to download
 * @param filename - Optional filename for the download (defaults to "download")
 */
function downloadBlob(blob: Blob, filename?: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

/**
 * Generates a deterministic pseudo-random hex string using FNV-1a hash for seeding
 * and xorshift algorithm for generation.
 *
 * @param seed - Input string to seed the random number generator
 * @param length - Desired length of the output hex string
 * @returns A deterministic hex string of the specified length
 */
function prng(seed: string, length: number): string {
  function fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
  }

  let state = fnv1a(seed);
  let result = "";

  function next(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  }

  while (result.length < length) {
    const rnd = next();
    result += rnd.toString(16).padStart(8, "0");
  }

  return result.substring(0, length);
}

/**
 * Solves a single proof-of-work challenge by finding a nonce that produces
 * a SHA-256 hash starting with the target string.
 *
 * @param salt - The salt string to prepend to each nonce attempt
 * @param target - The hex string that the hash must start with
 * @returns The nonce that solves the challenge
 * @throws Error if no solution is found within 10,000,000 attempts
 */
async function solveChallenge(salt: string, target: string): Promise<number> {
  const encoder = new TextEncoder();
  for (let nonce = 0; nonce < 10000000; nonce++) {
    const data = encoder.encode(salt + nonce.toString());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hash.startsWith(target)) {
      return nonce;
    }
  }
  throw new Error(`Failed to solve challenge with target ${target} after 10,000,000 attempts`);
}

/**
 * Solves multiple captcha challenges in sequence, updating progress as it goes.
 * Each challenge uses a deterministically generated salt and target based on the token.
 *
 * @param token - Unique token for this captcha session
 * @param challenge - Challenge parameters including count, salt length, and difficulty
 * @returns Array of nonces that solve each challenge
 */
async function solveCaptcha(token: string, challenge: Challenge): Promise<number[]> {
  const solutions: number[] = [];
  setProgress(0, challenge.c);
  for (let i = 1; i <= challenge.c; i++) {
    const salt = prng(`${token}${i}`, challenge.s);
    const target = prng(`${token}${i}d`, challenge.d);
    const solution = await solveChallenge(salt, target);
    solutions.push(solution);
    setProgress(i, challenge.c);
  }
  return solutions;
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
    let filename = "download";
    if (contentDisposition) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
      if (matches?.[1]) {
        filename = matches[1].replace(/['"]/g, "");
      }
    }

    const blob = await response.blob();
    downloadBlob(blob, filename);
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
    const solutions = await solveCaptcha(token, challenge);

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
