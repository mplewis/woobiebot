import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { showStatus } from "./index.js";

describe("showStatus", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="status"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sets text content and class for info message", () => {
    showStatus("Test message", "info");

    const status = document.getElementById("status") as HTMLDivElement;
    expect(status.textContent).toBe("Test message");
    expect(status.className).toBe("status info");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("sets text content and class for error message", () => {
    showStatus("Error occurred", "error");

    const status = document.getElementById("status") as HTMLDivElement;
    expect(status.textContent).toBe("Error occurred");
    expect(status.className).toBe("status error");
  });

  it("sets text content and class for success message", () => {
    showStatus("Success!", "success");

    const status = document.getElementById("status") as HTMLDivElement;
    expect(status.textContent).toBe("Success!");
    expect(status.className).toBe("status success");
  });

  it("overwrites previous message", () => {
    showStatus("First message", "info");
    showStatus("Second message", "error");

    const status = document.getElementById("status") as HTMLDivElement;
    expect(status.textContent).toBe("Second message");
    expect(status.className).toBe("status error");
  });
});
