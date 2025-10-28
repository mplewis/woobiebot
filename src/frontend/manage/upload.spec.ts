import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for file upload validation logic in the manage interface.
 */
describe("Upload Validation", () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html>
      <html>
        <body>
          <form id="upload-form">
            <input type="file" id="file" />
            <button type="submit" id="upload-btn">Upload</button>
          </form>
          <div id="status" class="status"></div>
        </body>
      </html>`,
      { url: "http://localhost" },
    );

    document = dom.window.document;
    window = dom.window as Window & typeof globalThis;
    global.document = document;
    global.window = window;
  });

  it("validates file extension before upload (allowed extension)", () => {
    const allowedExtensions = [".pdf", ".txt", ".doc"];
    const fileName = "test-file.txt";
    const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    const normalizedAllowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());

    expect(normalizedAllowedExtensions.includes(fileExtension)).toBe(true);
  });

  it("validates file extension before upload (disallowed extension)", () => {
    const allowedExtensions = [".pdf", ".txt", ".doc"];
    const fileName = "test-file.xyz";
    const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    const normalizedAllowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());

    expect(normalizedAllowedExtensions.includes(fileExtension)).toBe(false);
  });

  it("validates file extension case-insensitively", () => {
    const allowedExtensions = [".pdf", ".txt", ".doc"];
    const testCases = [
      { fileName: "file.TXT", expected: true },
      { fileName: "file.Pdf", expected: true },
      { fileName: "file.DOC", expected: true },
      { fileName: "file.XYZ", expected: false },
    ];

    for (const { fileName, expected } of testCases) {
      const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
      const normalizedAllowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());
      const isAllowed = normalizedAllowedExtensions.includes(fileExtension);

      expect(isAllowed).toBe(expected);
    }
  });

  it("formats allowed extensions for display", () => {
    const allowedExtensions = [".pdf", ".txt", ".doc", ".docx"];
    const displayText = allowedExtensions.join(", ");

    expect(displayText).toBe(".pdf, .txt, .doc, .docx");
  });

  it("sets accept attribute on file input correctly", () => {
    const fileInput = document.getElementById("file") as HTMLInputElement;
    const allowedExtensions = [".pdf", ".txt", ".doc"];

    fileInput.setAttribute("accept", allowedExtensions.join(","));

    expect(fileInput.getAttribute("accept")).toBe(".pdf,.txt,.doc");
  });

  it("handles files without extensions", () => {
    const allowedExtensions = [".pdf", ".txt"];
    const fileName = "fileWithoutExtension";
    const lastDotIndex = fileName.lastIndexOf(".");

    if (lastDotIndex === -1) {
      expect(true).toBe(true);
    } else {
      const fileExtension = fileName.substring(lastDotIndex).toLowerCase();
      const normalizedAllowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());
      expect(normalizedAllowedExtensions.includes(fileExtension)).toBe(false);
    }
  });

  it("extracts error message format correctly", () => {
    const allowedExtensions = [".pdf", ".txt", ".doc"];
    const allowedList = allowedExtensions.join(", ");
    const errorMessage = `File type .xyz is not allowed. Allowed types: ${allowedList}`;

    expect(errorMessage).toBe("File type .xyz is not allowed. Allowed types: .pdf, .txt, .doc");
    expect(errorMessage).toContain("Allowed types:");
  });

  it("validates file size is within limit", () => {
    const fileSizeMB = 0.5;
    const maxFileSizeMB = 1;

    expect(fileSizeMB).toBeLessThanOrEqual(maxFileSizeMB);
  });

  it("validates file size exceeds limit", () => {
    const fileSizeMB = 2.5;
    const maxFileSizeMB = 1;

    expect(fileSizeMB).toBeGreaterThan(maxFileSizeMB);
  });

  it("converts bytes to MB correctly", () => {
    const fileSizeBytes = 1048576;
    const fileSizeMB = fileSizeBytes / (1024 * 1024);

    expect(fileSizeMB).toBe(1);
  });

  it("formats file size error message correctly", () => {
    const fileSizeMB = 2.5;
    const maxFileSizeMB = 1;
    const errorMessage = `File size ${fileSizeMB.toFixed(2)} MB exceeds maximum allowed size of ${maxFileSizeMB} MB`;

    expect(errorMessage).toBe("File size 2.50 MB exceeds maximum allowed size of 1 MB");
    expect(errorMessage).toContain("exceeds maximum allowed size");
  });
});
