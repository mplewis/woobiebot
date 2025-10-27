import { describe, expect, it } from "vitest";
import { extractFilenameFromHeader } from "./download.js";

describe("extractFilenameFromHeader", () => {
  it("returns 'download' when header is null", () => {
    expect(extractFilenameFromHeader(null)).toBe("download");
  });

  it("returns 'download' when header is empty string", () => {
    expect(extractFilenameFromHeader("")).toBe("download");
  });

  it("extracts simple filename without quotes", () => {
    expect(extractFilenameFromHeader("attachment; filename=test.txt")).toBe("test.txt");
  });

  it("extracts filename with double quotes", () => {
    expect(extractFilenameFromHeader('attachment; filename="test.txt"')).toBe("test.txt");
  });

  it("extracts filename with single quotes", () => {
    expect(extractFilenameFromHeader("attachment; filename='test.txt'")).toBe("test.txt");
  });

  it("handles filename with spaces inside quotes", () => {
    expect(extractFilenameFromHeader('attachment; filename="my file.txt"')).toBe("my file.txt");
  });

  it("handles filename with special characters", () => {
    expect(extractFilenameFromHeader('attachment; filename="test-file_123.txt"')).toBe(
      "test-file_123.txt",
    );
  });

  it("returns first filename when multiple parameters present", () => {
    expect(
      extractFilenameFromHeader('attachment; filename="test.txt"; size=1234; modified=2024'),
    ).toBe("test.txt");
  });

  it("handles inline disposition", () => {
    expect(extractFilenameFromHeader('inline; filename="image.png"')).toBe("image.png");
  });

  it("returns 'download' when filename parameter missing", () => {
    expect(extractFilenameFromHeader("attachment")).toBe("download");
  });

  it("returns 'download' when filename value is empty", () => {
    expect(extractFilenameFromHeader("attachment; filename=")).toBe("download");
  });

  it("extracts filename without disposition type", () => {
    expect(extractFilenameFromHeader('filename="standalone.txt"')).toBe("standalone.txt");
  });

  it("handles filename with dots and multiple extensions", () => {
    expect(extractFilenameFromHeader('attachment; filename="archive.tar.gz"')).toBe(
      "archive.tar.gz",
    );
  });

  it("handles filename with unicode characters", () => {
    expect(extractFilenameFromHeader('attachment; filename="файл.txt"')).toBe("файл.txt");
  });
});
