import { describe, expect, it } from "vitest";
import { validateFilename, validateNoExistingFile } from "./validation.js";

/**
 * Tests for shared file rename validation logic.
 */
describe("validateFilename", () => {
  const allowedExtensions = [".pdf", ".txt", ".doc"];

  describe("Invalid characters validation", () => {
    it("rejects filenames with < character", () => {
      const result = validateFilename("test<file.txt", allowedExtensions);
      expect(result).toContain("cannot contain");
    });

    it("rejects filenames with > character", () => {
      const result = validateFilename("test>file.txt", allowedExtensions);
      expect(result).toContain("cannot contain");
    });

    it("rejects filenames with : character", () => {
      const result = validateFilename("test:file.txt", allowedExtensions);
      expect(result).toContain("cannot contain");
    });

    it('rejects filenames with " character', () => {
      const result = validateFilename('test"file.txt', allowedExtensions);
      expect(result).toContain("cannot contain");
    });

    it("rejects filenames with | character", () => {
      const result = validateFilename("test|file.txt", allowedExtensions);
      expect(result).toContain("cannot contain");
    });

    it("rejects filenames with ? character", () => {
      const result = validateFilename("test?file.txt", allowedExtensions);
      expect(result).toContain("cannot contain");
    });

    it("rejects filenames with * character", () => {
      const result = validateFilename("test*file.txt", allowedExtensions);
      expect(result).toContain("cannot contain");
    });

    it("accepts filenames without invalid characters", () => {
      const result = validateFilename("test-file_123.txt", allowedExtensions);
      expect(result).toBeNull();
    });
  });

  describe("Control characters validation", () => {
    it("rejects filenames with null character (ASCII 0)", () => {
      const result = validateFilename("test\x00file.txt", allowedExtensions);
      expect(result).toBe("Filename cannot contain special characters");
    });

    it("rejects filenames with tab character (ASCII 9)", () => {
      const result = validateFilename("test\tfile.txt", allowedExtensions);
      expect(result).toBe("Filename cannot contain special characters");
    });

    it("rejects filenames with newline character (ASCII 10)", () => {
      const result = validateFilename("test\nfile.txt", allowedExtensions);
      expect(result).toBe("Filename cannot contain special characters");
    });

    it("accepts filenames with space character (ASCII 32)", () => {
      const result = validateFilename("test file.txt", allowedExtensions);
      expect(result).toBeNull();
    });

    it("accepts filenames without control characters", () => {
      const result = validateFilename("test-file.txt", allowedExtensions);
      expect(result).toBeNull();
    });
  });

  describe("Reserved names validation", () => {
    it('rejects filename "."', () => {
      const result = validateFilename(".", allowedExtensions);
      expect(result).toBe('Filename cannot be "." or ".."');
    });

    it('rejects filename ".."', () => {
      const result = validateFilename("..", allowedExtensions);
      expect(result).toBe('Filename cannot be "." or ".."');
    });

    it("accepts normal filenames", () => {
      const result = validateFilename("test.txt", allowedExtensions);
      expect(result).toBeNull();
    });
  });

  describe("Dotfile validation", () => {
    it("rejects filenames starting with .", () => {
      const result = validateFilename(".hidden.txt", allowedExtensions);
      expect(result).toBe('Filename cannot start with "."');
    });

    it("rejects filenames starting with . (single dot)", () => {
      const result = validateFilename(".gitignore", allowedExtensions);
      expect(result).toBe('Filename cannot start with "."');
    });

    it("accepts filenames not starting with .", () => {
      const result = validateFilename("test.txt", allowedExtensions);
      expect(result).toBeNull();
    });

    it("accepts filenames with dots in the middle", () => {
      const result = validateFilename("my.test.file.txt", allowedExtensions);
      expect(result).toBeNull();
    });
  });

  describe("Length validation", () => {
    it("rejects filenames longer than 255 characters", () => {
      const result = validateFilename(`${"a".repeat(256)}.txt`, allowedExtensions);
      expect(result).toBe("Filename cannot exceed 255 characters");
    });

    it("accepts filenames with exactly 255 characters", () => {
      const result = validateFilename(`${"a".repeat(251)}.txt`, allowedExtensions);
      expect(result).toBeNull();
    });

    it("accepts filenames shorter than 255 characters", () => {
      const result = validateFilename("test.txt", allowedExtensions);
      expect(result).toBeNull();
    });
  });

  describe("File extension validation", () => {
    it("accepts filename with allowed extension (.txt)", () => {
      const result = validateFilename("test-file.txt", allowedExtensions);
      expect(result).toBeNull();
    });

    it("accepts filename with allowed extension (.pdf)", () => {
      const result = validateFilename("document.pdf", allowedExtensions);
      expect(result).toBeNull();
    });

    it("accepts filename with allowed extension (.doc)", () => {
      const result = validateFilename("report.doc", allowedExtensions);
      expect(result).toBeNull();
    });

    it("rejects filename with disallowed extension (.xyz)", () => {
      const result = validateFilename("test-file.xyz", allowedExtensions);
      expect(result).toContain("not allowed");
      expect(result).toContain(".xyz");
    });

    it("rejects filename with disallowed extension (.exe)", () => {
      const result = validateFilename("program.exe", allowedExtensions);
      expect(result).toContain("not allowed");
      expect(result).toContain(".exe");
    });

    it("validates extension case-insensitively (.TXT)", () => {
      const result = validateFilename("test.TXT", allowedExtensions);
      expect(result).toBeNull();
    });

    it("validates extension case-insensitively (.PDF)", () => {
      const result = validateFilename("document.PDF", allowedExtensions);
      expect(result).toBeNull();
    });

    it("handles filenames with multiple dots", () => {
      const result = validateFilename("my.test.file.txt", allowedExtensions);
      expect(result).toBeNull();
    });

    it("formats error message correctly for disallowed extension", () => {
      const result = validateFilename("test.xyz", allowedExtensions);
      expect(result).toBe(
        "File extension .xyz is not allowed. Allowed extensions: .pdf, .txt, .doc",
      );
    });
  });

  describe("Empty filename validation", () => {
    it("rejects empty filename", () => {
      const result = validateFilename("", allowedExtensions);
      expect(result).toBe("Please enter a new filename");
    });

    it("accepts non-empty filename", () => {
      const result = validateFilename("test.txt", allowedExtensions);
      expect(result).toBeNull();
    });
  });

  describe("Combined validation scenarios", () => {
    it("validates a completely valid filename", () => {
      const result = validateFilename("my-test-file_123.txt", allowedExtensions);
      expect(result).toBeNull();
    });

    it("catches multiple validation failures (dotfile takes precedence)", () => {
      const result = validateFilename(".test<file>.txt", allowedExtensions);
      expect(result).not.toBeNull();
    });

    it("rejects filename with control char and invalid extension", () => {
      const result = validateFilename("test\x00file.exe", allowedExtensions);
      expect(result).not.toBeNull();
    });
  });
});

describe("validateNoExistingFile", () => {
  const existingFiles = ["document.pdf", "report.txt", "data.doc"];

  it("rejects filename that already exists (exact match)", () => {
    const result = validateNoExistingFile("document.pdf", existingFiles);
    expect(result).toBe("A file with that name already exists");
  });

  it("rejects filename that already exists (case insensitive)", () => {
    const result = validateNoExistingFile("DOCUMENT.PDF", existingFiles);
    expect(result).toBe("A file with that name already exists");
  });

  it("rejects filename that already exists (mixed case)", () => {
    const result = validateNoExistingFile("Document.PDF", existingFiles);
    expect(result).toBe("A file with that name already exists");
  });

  it("accepts filename that does not exist", () => {
    const result = validateNoExistingFile("newfile.pdf", existingFiles);
    expect(result).toBeNull();
  });

  it("accepts filename in empty directory", () => {
    const result = validateNoExistingFile("newfile.pdf", []);
    expect(result).toBeNull();
  });

  it("rejects similar filename with different extension that exists", () => {
    const result = validateNoExistingFile("report.txt", existingFiles);
    expect(result).toBe("A file with that name already exists");
  });

  it("accepts similar filename with different extension that does not exist", () => {
    const result = validateNoExistingFile("document.txt", existingFiles);
    expect(result).toBeNull();
  });
});
