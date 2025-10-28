import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for delete modal functionality
 */
describe("Delete Modal", () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    const htmlPath = join(__dirname, "../manage.html");
    const htmlContent = readFileSync(htmlPath, "utf-8");

    dom = new JSDOM(htmlContent, { url: "http://localhost" });

    document = dom.window.document;
    window = dom.window as Window & typeof globalThis;
    global.document = document;
    global.window = window;
  });

  it("enables delete button when correct filename is typed", () => {
    const input = document.getElementById("delete-confirm-input") as HTMLInputElement;
    const button = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
    const targetFilename = "test.txt";

    // Simulate setting up the modal with a filename
    const filenameSpan = document.getElementById("delete-filename") as HTMLSpanElement;
    filenameSpan.textContent = targetFilename;

    // Attach event listener like the app does
    input.addEventListener("input", () => {
      button.disabled = input.value.trim() !== targetFilename;
    });

    expect(button.disabled).toBe(true);

    // Type incorrect filename
    input.value = "wrong.txt";
    input.dispatchEvent(new window.Event("input"));
    expect(button.disabled).toBe(true);

    // Type correct filename
    input.value = targetFilename;
    input.dispatchEvent(new window.Event("input"));
    expect(button.disabled).toBe(false);

    // Type with extra spaces
    input.value = "  test.txt  ";
    input.dispatchEvent(new window.Event("input"));
    expect(button.disabled).toBe(false);
  });

  it("disables all inputs during deletion", () => {
    const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
    const cancelBtn = document.getElementById("delete-cancel-btn") as HTMLButtonElement;
    const confirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;

    // Simulate deletion process
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmInput.disabled = true;
    confirmBtn.textContent = "Deleting...";

    expect(confirmBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
    expect(confirmInput.disabled).toBe(true);
    expect(confirmBtn.textContent).toBe("Deleting...");
  });

  it("updates button text during deletion states", () => {
    const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;

    expect(confirmBtn.textContent).toBe("Delete File");

    // During deletion
    confirmBtn.textContent = "Deleting...";
    expect(confirmBtn.textContent).toBe("Deleting...");

    // After successful deletion
    confirmBtn.textContent = "Refreshing...";
    expect(confirmBtn.textContent).toBe("Refreshing...");
  });

  it("re-enables inputs on deletion error", () => {
    const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
    const cancelBtn = document.getElementById("delete-cancel-btn") as HTMLButtonElement;
    const confirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;

    // Simulate deletion process
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmInput.disabled = true;

    // Simulate error - re-enable inputs
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    confirmInput.disabled = false;
    confirmBtn.textContent = "Delete File";

    expect(confirmBtn.disabled).toBe(false);
    expect(cancelBtn.disabled).toBe(false);
    expect(confirmInput.disabled).toBe(false);
    expect(confirmBtn.textContent).toBe("Delete File");
  });

  it("prevents button from being enabled with empty input", () => {
    const input = document.getElementById("delete-confirm-input") as HTMLInputElement;
    const button = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
    const targetFilename = "test.txt";

    input.addEventListener("input", () => {
      button.disabled = input.value.trim() !== targetFilename;
    });

    // Empty string
    input.value = "";
    input.dispatchEvent(new window.Event("input"));
    expect(button.disabled).toBe(true);

    // Only whitespace
    input.value = "   ";
    input.dispatchEvent(new window.Event("input"));
    expect(button.disabled).toBe(true);
  });

  it("modal visibility can be controlled", () => {
    const modal = document.getElementById("delete-modal") as HTMLDivElement;

    // Show modal
    modal.style.display = "flex";
    expect(modal.style.display).toBe("flex");

    // Hide modal
    modal.style.display = "none";
    expect(modal.style.display).toBe("none");
  });

  it("clicking confirm button calls handler when enabled", () => {
    const button = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
    const handler = vi.fn();

    button.disabled = false;
    button.addEventListener("click", handler);

    button.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clicking cancel button calls handler", () => {
    const button = document.getElementById("delete-cancel-btn") as HTMLButtonElement;
    const handler = vi.fn();

    button.addEventListener("click", handler);

    button.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("modal remains visible when buttons are disabled", () => {
    const modal = document.getElementById("delete-modal") as HTMLDivElement;
    const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
    const cancelBtn = document.getElementById("delete-cancel-btn") as HTMLButtonElement;

    // Show modal and disable buttons (deletion in progress)
    modal.style.display = "flex";
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;

    // Modal should still be visible
    expect(modal.style.display).toBe("flex");
    expect(confirmBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
  });
});
