import { describe, expect, it } from "vitest";
import type { DirectoryTree } from "../../shared/types.js";
import {
  determineRenameOperation,
  extractDirectoryPath,
  fileMatchesSearch,
  getFilesInDirectory,
  isAllowedFileExtension,
  normalizeSearchTerm,
  validateFileSize,
} from "./validation.js";

const TEST_DATE = new Date("2024-01-01T00:00:00Z");

describe("extractDirectoryPath", () => {
  it("extracts directory path from file path", () => {
    expect(extractDirectoryPath("foo/bar/file.txt")).toBe("foo/bar");
  });

  it("handles single-level paths", () => {
    expect(extractDirectoryPath("file.txt")).toBe("");
  });

  it("handles paths with multiple slashes", () => {
    expect(extractDirectoryPath("a/b/c/d/file.txt")).toBe("a/b/c/d");
  });

  it("handles empty string", () => {
    expect(extractDirectoryPath("")).toBe("");
  });

  it("handles root-level files", () => {
    expect(extractDirectoryPath("/file.txt")).toBe("");
  });

  it("handles paths with no extension", () => {
    expect(extractDirectoryPath("foo/bar/baz")).toBe("foo/bar");
  });
});

describe("isAllowedFileExtension", () => {
  it("returns true for allowed extension", () => {
    expect(isAllowedFileExtension("document.pdf", [".pdf", ".txt"])).toBe(true);
  });

  it("returns false for disallowed extension", () => {
    expect(isAllowedFileExtension("image.jpg", [".pdf", ".txt"])).toBe(false);
  });

  it("handles case-insensitive extensions", () => {
    expect(isAllowedFileExtension("document.PDF", [".pdf", ".txt"])).toBe(true);
  });

  it("handles case-insensitive allowed list", () => {
    expect(isAllowedFileExtension("document.pdf", [".PDF", ".TXT"])).toBe(true);
  });

  it("handles mixed case in both filename and allowed list", () => {
    expect(isAllowedFileExtension("Document.PdF", [".PDF", ".txt"])).toBe(true);
  });

  it("returns false for files with no extension", () => {
    expect(isAllowedFileExtension("document", [".pdf", ".txt"])).toBe(false);
  });

  it("handles multiple dots in filename", () => {
    expect(isAllowedFileExtension("my.document.pdf", [".pdf", ".txt"])).toBe(true);
  });

  it("returns false for empty allowed extensions list", () => {
    expect(isAllowedFileExtension("document.pdf", [])).toBe(false);
  });
});

describe("validateFileSize", () => {
  it("returns valid for file under size limit", () => {
    const result = validateFileSize(1024 * 1024, 10);
    expect(result.valid).toBe(true);
  });

  it("returns valid for file exactly at size limit", () => {
    const result = validateFileSize(10 * 1024 * 1024, 10);
    expect(result.valid).toBe(true);
  });

  it("returns invalid for file over size limit", () => {
    const result = validateFileSize(11 * 1024 * 1024, 10);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.actualSizeMB).toBeCloseTo(11, 1);
    }
  });

  it("returns invalid with correct size for large file", () => {
    const result = validateFileSize(100 * 1024 * 1024, 50);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.actualSizeMB).toBeCloseTo(100, 1);
    }
  });

  it("handles zero byte files", () => {
    const result = validateFileSize(0, 10);
    expect(result.valid).toBe(true);
  });

  it("handles fractional MB sizes", () => {
    const result = validateFileSize(1.5 * 1024 * 1024, 1);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.actualSizeMB).toBeCloseTo(1.5, 1);
    }
  });
});

describe("normalizeSearchTerm", () => {
  it("converts to lowercase", () => {
    expect(normalizeSearchTerm("HELLO")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(normalizeSearchTerm("  hello  ")).toBe("hello");
  });

  it("handles mixed case with whitespace", () => {
    expect(normalizeSearchTerm("  HeLLo WoRLD  ")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(normalizeSearchTerm("")).toBe("");
  });

  it("handles whitespace-only string", () => {
    expect(normalizeSearchTerm("   ")).toBe("");
  });

  it("preserves internal whitespace", () => {
    expect(normalizeSearchTerm("hello world")).toBe("hello world");
  });
});

describe("fileMatchesSearch", () => {
  it("returns true for exact match", () => {
    expect(fileMatchesSearch("test.txt", "test.txt")).toBe(true);
  });

  it("returns true for substring match", () => {
    expect(fileMatchesSearch("my-test-file.txt", "test")).toBe(true);
  });

  it("returns false for non-match", () => {
    expect(fileMatchesSearch("document.pdf", "test")).toBe(false);
  });

  it("handles case-insensitive matching", () => {
    expect(fileMatchesSearch("MyFile.TXT", "myfile")).toBe(true);
  });

  it("handles empty search term matches everything", () => {
    expect(fileMatchesSearch("anything.txt", "")).toBe(true);
  });

  it("handles partial matches at start", () => {
    expect(fileMatchesSearch("prefix-file.txt", "prefix")).toBe(true);
  });

  it("handles partial matches at end", () => {
    expect(fileMatchesSearch("file-suffix.txt", "suffix")).toBe(true);
  });

  it("handles partial matches in middle", () => {
    expect(fileMatchesSearch("before-middle-after.txt", "middle")).toBe(true);
  });
});

describe("getFilesInDirectory", () => {
  it("returns empty array for empty tree", () => {
    expect(getFilesInDirectory("", {})).toEqual([]);
  });

  it("returns files at root level", () => {
    const tree: DirectoryTree = {
      _files: [
        {
          id: "1",
          name: "file1.txt",
          path: "file1.txt",
          absolutePath: "/test/file1.txt",
          size: 100,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
        {
          id: "2",
          name: "file2.txt",
          path: "file2.txt",
          absolutePath: "/test/file2.txt",
          size: 200,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
      ],
    };

    expect(getFilesInDirectory("", tree)).toEqual(["file1.txt", "file2.txt"]);
  });

  it("returns files in nested directory", () => {
    const tree: DirectoryTree = {
      folder: {
        _files: [
          {
            id: "1",
            name: "nested.txt",
            path: "folder/nested.txt",
            absolutePath: "/test/folder/nested.txt",
            size: 100,
            mtime: TEST_DATE,
            mimeType: "text/plain",
          },
        ],
      },
    };

    expect(getFilesInDirectory("folder", tree)).toEqual(["nested.txt"]);
  });

  it("returns files in deeply nested directory", () => {
    const tree: DirectoryTree = {
      a: {
        b: {
          c: {
            _files: [
              {
                id: "1",
                name: "deep.txt",
                path: "a/b/c/deep.txt",
                absolutePath: "/test/a/b/c/deep.txt",
                size: 100,
                mtime: TEST_DATE,
                mimeType: "text/plain",
              },
            ],
          },
        },
      },
    };

    expect(getFilesInDirectory("a/b/c", tree)).toEqual(["deep.txt"]);
  });

  it("returns empty array for non-existent directory", () => {
    const tree: DirectoryTree = {
      folder: {},
    };

    expect(getFilesInDirectory("nonexistent", tree)).toEqual([]);
  });

  it("returns empty array for directory with no files", () => {
    const tree: DirectoryTree = {
      folder: {},
    };

    expect(getFilesInDirectory("folder", tree)).toEqual([]);
  });

  it("handles paths with trailing slash", () => {
    const tree: DirectoryTree = {
      folder: {
        _files: [
          {
            id: "1",
            name: "file.txt",
            path: "folder/file.txt",
            absolutePath: "/test/folder/file.txt",
            size: 100,
            mtime: TEST_DATE,
            mimeType: "text/plain",
          },
        ],
      },
    };

    expect(getFilesInDirectory("folder/", tree)).toEqual(["file.txt"]);
  });

  it("returns empty array when path goes through files array", () => {
    const tree: DirectoryTree = {
      _files: [
        {
          id: "1",
          name: "file.txt",
          path: "file.txt",
          absolutePath: "/test/file.txt",
          size: 100,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
      ],
    };

    expect(getFilesInDirectory("file.txt/something", tree)).toEqual([]);
  });
});

describe("determineRenameOperation", () => {
  const ALLOWED_EXTENSIONS = [".txt", ".pdf"];

  it("disables button when filename is invalid", () => {
    const result = determineRenameOperation(
      "folder",
      "file.txt",
      "folder",
      "invalid.jpg",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(true);
    expect(result.buttonText).toBe("Rename");
    expect(result.statusType).toBe("error");
    expect(result.statusMessage).toContain("allowed");
  });

  it("disables button when nothing has changed", () => {
    const result = determineRenameOperation(
      "folder",
      "file.txt",
      "folder",
      "file.txt",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(true);
    expect(result.buttonText).toBe("Rename");
    expect(result.statusMessage).toBe("");
  });

  it("enables rename when only name changed", () => {
    const result = determineRenameOperation(
      "folder",
      "old.txt",
      "folder",
      "new.txt",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(false);
    expect(result.buttonText).toBe("Rename");
    expect(result.statusMessage).toBe("");
  });

  it("enables move when only path changed", () => {
    const result = determineRenameOperation(
      "folder1",
      "file.txt",
      "folder2",
      "file.txt",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(false);
    expect(result.buttonText).toBe("Move");
    expect(result.statusMessage).toBe("");
  });

  it("enables move and rename when both changed", () => {
    const result = determineRenameOperation(
      "folder1",
      "old.txt",
      "folder2",
      "new.txt",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(false);
    expect(result.buttonText).toBe("Move and Rename");
    expect(result.statusMessage).toBe("");
  });

  it("disables button when target file already exists", () => {
    const result = determineRenameOperation(
      "folder",
      "old.txt",
      "folder",
      "existing.txt",
      ALLOWED_EXTENSIONS,
      ["existing.txt", "other.txt"],
    );

    expect(result.disabled).toBe(true);
    expect(result.buttonText).toBe("Rename");
    expect(result.statusType).toBe("error");
    expect(result.statusMessage).toContain("already exists");
  });

  it("allows rename when moving to different directory with same name", () => {
    const result = determineRenameOperation(
      "folder1",
      "file.txt",
      "folder2",
      "file.txt",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(false);
    expect(result.buttonText).toBe("Move");
  });

  it("handles empty current path", () => {
    const result = determineRenameOperation(
      "",
      "file.txt",
      "folder",
      "file.txt",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(false);
    expect(result.buttonText).toBe("Move");
  });

  it("handles empty new path", () => {
    const result = determineRenameOperation(
      "folder",
      "file.txt",
      "",
      "file.txt",
      ALLOWED_EXTENSIONS,
      [],
    );

    expect(result.disabled).toBe(false);
    expect(result.buttonText).toBe("Move");
  });
});
