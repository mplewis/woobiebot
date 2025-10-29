import prettier from "prettier";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthData, DirectoryTree } from "../../shared/types.js";
import {
  collapseAll,
  determineRenameOperation,
  expandAll,
  extractDirectoryPath,
  fileMatchesSearch,
  filterTree,
  getFilesInDirectory,
  hideDeleteModal,
  isAllowedFileExtension,
  normalizeSearchTerm,
  openRenameBox,
  openUploadBox,
  renderDirectoryTree,
  showDeleteModal,
  showRenameStatus,
  showStatus,
  updateRenameButton,
  validateFileSize,
} from "./index.js";

vi.mock("./directoryState.js", () => ({
  getAllTreePaths: vi.fn(() => new Set(["folder1", "folder2"])),
  saveExpandedDirectories: vi.fn(),
  isExpandedDirectory: vi.fn(() => false),
  toggleDirectoryState: vi.fn(),
  cleanupDeletedDirectories: vi.fn(),
}));

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

describe("DOM: showStatus", () => {
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

describe("DOM: showRenameStatus", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="rename-status"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sets text content and class for info message", () => {
    showRenameStatus("Rename info", "info");

    const status = document.getElementById("rename-status") as HTMLDivElement;
    expect(status.textContent).toBe("Rename info");
    expect(status.className).toBe("status info");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-label")).toBe("polite");
    expect(status.style.display).toBe("");
  });

  it("sets text content and class for error message", () => {
    showRenameStatus("Rename error", "error");

    const status = document.getElementById("rename-status") as HTMLDivElement;
    expect(status.textContent).toBe("Rename error");
    expect(status.className).toBe("status error");
  });

  it("hides element when message is empty", () => {
    showRenameStatus("", "info");

    const status = document.getElementById("rename-status") as HTMLDivElement;
    expect(status.textContent).toBe("");
    expect(status.style.display).toBe("none");
  });

  it("shows element when message is provided", () => {
    const status = document.getElementById("rename-status") as HTMLDivElement;
    status.style.display = "none";

    showRenameStatus("Now visible", "success");

    expect(status.style.display).toBe("");
  });
});

describe("DOM: showDeleteModal", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="delete-modal">
        <span id="delete-filename"></span>
        <input id="delete-confirm-input" />
        <button id="delete-confirm-btn"></button>
      </div>
    `;
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows modal with file information", () => {
    showDeleteModal("file123", "test.txt");

    const modal = document.getElementById("delete-modal") as HTMLDivElement;
    const filenameSpan = document.getElementById("delete-filename") as HTMLSpanElement;
    const confirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;
    const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;

    expect(modal.classList.contains("show")).toBe(true);
    expect(filenameSpan.textContent).toBe("test.txt");
    expect(confirmInput.value).toBe("");
    expect(confirmInput.placeholder).toBe("test.txt");
    expect(confirmBtn.disabled).toBe(true);
  });

  it("focuses input after timeout", () => {
    const confirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;
    const focusSpy = vi.spyOn(confirmInput, "focus");

    showDeleteModal("file123", "test.txt");

    expect(focusSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(focusSpy).toHaveBeenCalled();
  });
});

describe("DOM: hideDeleteModal", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="delete-modal" class="show">
        <span id="delete-filename">old-file.txt</span>
        <input id="delete-confirm-input" />
        <button id="delete-confirm-btn"></button>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hides modal and clears state", () => {
    showDeleteModal("file123", "test.txt");

    const modal = document.getElementById("delete-modal") as HTMLDivElement;
    expect(modal.classList.contains("show")).toBe(true);

    hideDeleteModal();

    expect(modal.classList.contains("show")).toBe(false);
  });
});

describe("DOM: openUploadBox", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="upload-section">
        <input id="directory" />
      </div>
    `;
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("sets directory input value", () => {
    openUploadBox("folder/subfolder");

    const directoryInput = document.getElementById("directory") as HTMLInputElement;
    expect(directoryInput.value).toBe("folder/subfolder");
  });

  it("scrolls to upload section", () => {
    const uploadSection = document.getElementById("upload-section") as HTMLDivElement;

    openUploadBox("test/path");

    expect(uploadSection.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("focuses directory input after timeout", () => {
    const directoryInput = document.getElementById("directory") as HTMLInputElement;
    const focusSpy = vi.spyOn(directoryInput, "focus");

    openUploadBox("test/path");

    expect(focusSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(focusSpy).toHaveBeenCalled();
  });
});

describe("DOM: openRenameBox", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="rename-section">
        <input id="current-path" />
        <input id="current-name" />
        <input id="new-path" />
        <input id="new-name" />
        <button id="rename-btn"></button>
        <div id="rename-status"></div>
      </div>
    `;
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("sets all input values correctly", () => {
    openRenameBox("file123", "folder/subfolder/test.txt", "test.txt");

    const currentPathInput = document.getElementById("current-path") as HTMLInputElement;
    const currentNameInput = document.getElementById("current-name") as HTMLInputElement;
    const newPathInput = document.getElementById("new-path") as HTMLInputElement;
    const newNameInput = document.getElementById("new-name") as HTMLInputElement;

    expect(currentPathInput.value).toBe("folder/subfolder");
    expect(currentNameInput.value).toBe("test.txt");
    expect(newPathInput.value).toBe("folder/subfolder");
    expect(newNameInput.value).toBe("test.txt");
  });

  it("handles root-level files", () => {
    openRenameBox("file456", "root.txt", "root.txt");

    const currentPathInput = document.getElementById("current-path") as HTMLInputElement;
    expect(currentPathInput.value).toBe("/");
  });

  it("scrolls to rename section", () => {
    const renameSection = document.getElementById("rename-section") as HTMLDivElement;

    openRenameBox("file123", "test.txt", "test.txt");

    expect(renameSection.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("focuses and selects new name input after timeout", () => {
    const newNameInput = document.getElementById("new-name") as HTMLInputElement;
    const focusSpy = vi.spyOn(newNameInput, "focus");
    const selectSpy = vi.spyOn(newNameInput, "select");

    openRenameBox("file123", "test.txt", "test.txt");

    expect(focusSpy).not.toHaveBeenCalled();
    expect(selectSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
  });
});

describe("DOM: updateRenameButton", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="rename-section">
        <input id="current-path" />
        <input id="current-name" />
        <input id="new-path" value="folder" />
        <input id="new-name" value="newfile.txt" />
        <button id="rename-btn"></button>
        <div id="rename-status"></div>
      </div>
    `;
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("updates button and shows validation error when file extension not allowed", () => {
    openRenameBox("file123", "folder/oldfile.txt", "oldfile.txt");

    const newNameInput = document.getElementById("new-name") as HTMLInputElement;
    newNameInput.value = "newfile.txt";

    updateRenameButton();

    const renameBtn = document.getElementById("rename-btn") as HTMLButtonElement;
    const renameStatus = document.getElementById("rename-status") as HTMLDivElement;

    expect(renameBtn.disabled).toBe(true);
    expect(renameBtn.textContent).toBe("Rename");
    expect(renameStatus.className).toContain("error");
  });

  it("disables button when nothing changed", () => {
    openRenameBox("file123", "folder/test.txt", "test.txt");

    const newPathInput = document.getElementById("new-path") as HTMLInputElement;
    const newNameInput = document.getElementById("new-name") as HTMLInputElement;
    newPathInput.value = "folder";
    newNameInput.value = "test.txt";

    updateRenameButton();

    const renameBtn = document.getElementById("rename-btn") as HTMLButtonElement;
    expect(renameBtn.disabled).toBe(true);
    expect(renameBtn.textContent).toBe("Rename");
  });
});

describe("DOM: expandAll", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="file-tree">
        <details><summary>Folder 1</summary></details>
        <details><summary>Folder 2</summary></details>
        <details><summary>Folder 3</summary></details>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens all details elements", () => {
    const allDetails = document.querySelectorAll("#file-tree details");
    allDetails.forEach((detail) => {
      (detail as HTMLDetailsElement).open = false;
    });

    expandAll();

    allDetails.forEach((detail) => {
      expect((detail as HTMLDetailsElement).open).toBe(true);
    });
  });
});

describe("DOM: collapseAll", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="file-tree">
        <details open><summary>Folder 1</summary></details>
        <details open><summary>Folder 2</summary></details>
        <details open><summary>Folder 3</summary></details>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("closes all details elements", () => {
    collapseAll();

    const allDetails = document.querySelectorAll("#file-tree details");
    allDetails.forEach((detail) => {
      expect((detail as HTMLDetailsElement).open).toBe(false);
    });
  });
});

describe("DOM: filterTree", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="file-tree">
        <div class="tree-file">
          <a class="tree-file-link">test.txt</a>
        </div>
        <div class="tree-file">
          <a class="tree-file-link">document.pdf</a>
        </div>
        <div class="tree-file">
          <a class="tree-file-link">another-test.txt</a>
        </div>
        <details>
          <summary>Folder</summary>
          <div>
            <div class="tree-file">
              <a class="tree-file-link">nested.txt</a>
            </div>
          </div>
        </details>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows all files when search is empty", () => {
    filterTree("");

    const allFiles = document.querySelectorAll("#file-tree .tree-file");
    allFiles.forEach((file) => {
      expect(file.classList.contains("hidden")).toBe(false);
    });
  });

  it("filters files by search term", () => {
    filterTree("test");

    const files = document.querySelectorAll("#file-tree .tree-file");
    const testFile = files[0];
    const documentFile = files[1];
    const anotherTestFile = files[2];

    expect(testFile.classList.contains("hidden")).toBe(false);
    expect(documentFile.classList.contains("hidden")).toBe(true);
    expect(anotherTestFile.classList.contains("hidden")).toBe(false);
  });

  it("is case-insensitive", () => {
    filterTree("TEST");

    const files = document.querySelectorAll("#file-tree .tree-file");
    const testFile = files[0];

    expect(testFile.classList.contains("hidden")).toBe(false);
  });

  it("opens directories with matching files", () => {
    filterTree("nested");

    const details = document.querySelector("#file-tree details") as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(details.classList.contains("hidden")).toBe(false);
  });

  it("hides directories with no matching files", () => {
    filterTree("nonexistent");

    const details = document.querySelector("#file-tree details") as HTMLDetailsElement;
    expect(details.classList.contains("hidden")).toBe(true);
  });
});

describe("DOM: renderDirectoryTree", () => {
  let container: HTMLElement;
  let mockAuthData: AuthData;

  async function formatHTML(html: string): Promise<string> {
    return await prettier.format(html, { parser: "html" });
  }

  beforeEach(() => {
    mockAuthData = { userId: "user123", signature: "abc123", expiresAt: 9999999999 };
    container = document.createElement("div");
  });

  it("renders empty tree message", async () => {
    renderDirectoryTree({}, container, mockAuthData);

    expect(await formatHTML(container.innerHTML)).toMatchInlineSnapshot(`
      "<div class="tree-empty">No files indexed yet</div>
      "
    `);
  });

  it("renders files at root level", async () => {
    const tree: DirectoryTree = {
      _files: [
        {
          id: "file1",
          name: "test.txt",
          path: "test.txt",
          absolutePath: "/test/test.txt",
          size: 100,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
      ],
    };

    renderDirectoryTree(tree, container, mockAuthData);

    expect(await formatHTML(container.innerHTML)).toMatchInlineSnapshot(`
      "<div class="tree-file" style="padding-left: 0px">
        <a
          href="/manage/download/file1?userId=user123&amp;signature=abc123&amp;expiresAt=9999999999"
          class="tree-file-link"
          download="test.txt"
          >test.txt</a
        ><button
          class="tree-file-rename btn-xs"
          title="Rename/move file"
          aria-label="Rename/move test.txt"
        >
          ✎</button
        ><button
          class="tree-file-delete btn-xs"
          title="Delete file"
          aria-label="Delete test.txt"
        >
          ✕
        </button>
      </div>
      "
    `);
  });

  it("renders directory with nested files", async () => {
    const tree: DirectoryTree = {
      folder: {
        _files: [
          {
            id: "file2",
            name: "nested.txt",
            path: "folder/nested.txt",
            absolutePath: "/test/folder/nested.txt",
            size: 200,
            mtime: TEST_DATE,
            mimeType: "text/plain",
          },
        ],
      },
    };

    renderDirectoryTree(tree, container, mockAuthData);

    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details?.querySelector(".tree-dir-name")?.textContent).toBe("folder");
    expect(await formatHTML(container.innerHTML)).toMatchInlineSnapshot(`
      "<details style="padding-left: 0px">
        <summary class="tree-dir">
          <span class="tree-dir-content"
            ><span class="tree-icon">▶</span
            ><span class="tree-dir-name">folder</span></span
          ><button
            class="tree-upload-btn btn-xs"
            title="Upload to this folder"
            aria-label="Upload to folder folder"
          >
            ↑
          </button>
        </summary>
        <div>
          <div class="tree-file" style="padding-left: 20px">
            <a
              href="/manage/download/file2?userId=user123&amp;signature=abc123&amp;expiresAt=9999999999"
              class="tree-file-link"
              download="nested.txt"
              >nested.txt</a
            ><button
              class="tree-file-rename btn-xs"
              title="Rename/move file"
              aria-label="Rename/move nested.txt"
            >
              ✎</button
            ><button
              class="tree-file-delete btn-xs"
              title="Delete file"
              aria-label="Delete nested.txt"
            >
              ✕
            </button>
          </div>
        </div>
      </details>
      "
    `);
  });

  it("renders multiple directories sorted alphabetically", () => {
    const tree: DirectoryTree = {
      zebra: {},
      apple: {},
      middle: {},
    };

    renderDirectoryTree(tree, container, mockAuthData);

    const summaries = container.querySelectorAll(".tree-dir-name");
    expect(summaries[0].textContent).toBe("apple");
    expect(summaries[1].textContent).toBe("middle");
    expect(summaries[2].textContent).toBe("zebra");
  });

  it("renders deeply nested directories", () => {
    const tree: DirectoryTree = {
      level1: {
        level2: {
          _files: [
            {
              id: "deep",
              name: "deep.txt",
              path: "level1/level2/deep.txt",
              absolutePath: "/test/level1/level2/deep.txt",
              size: 50,
              mtime: TEST_DATE,
              mimeType: "text/plain",
            },
          ],
        },
      },
    };

    renderDirectoryTree(tree, container, mockAuthData);

    const deepFile = container.querySelector(".tree-file");
    expect(deepFile?.getAttribute("style")).toContain("padding-left: 40px");
  });

  it("renders tree with three files, two in nested directory", async () => {
    const tree: DirectoryTree = {
      _files: [
        {
          id: "root1",
          name: "root-file.txt",
          path: "root-file.txt",
          absolutePath: "/test/root-file.txt",
          size: 100,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
      ],
      docs: {
        _files: [
          {
            id: "doc1",
            name: "readme.md",
            path: "docs/readme.md",
            absolutePath: "/test/docs/readme.md",
            size: 200,
            mtime: TEST_DATE,
            mimeType: "text/markdown",
          },
          {
            id: "doc2",
            name: "guide.pdf",
            path: "docs/guide.pdf",
            absolutePath: "/test/docs/guide.pdf",
            size: 500,
            mtime: TEST_DATE,
            mimeType: "application/pdf",
          },
        ],
      },
    };

    renderDirectoryTree(tree, container, mockAuthData);

    const allFiles = container.querySelectorAll(".tree-file");
    expect(allFiles).toHaveLength(3);

    const details = container.querySelector("details");
    expect(details?.querySelector(".tree-dir-name")?.textContent).toBe("docs");

    const nestedFiles = details?.querySelectorAll(".tree-file");
    expect(nestedFiles).toHaveLength(2);
    expect(nestedFiles?.[0].querySelector(".tree-file-link")?.textContent).toBe("guide.pdf");
    expect(nestedFiles?.[1].querySelector(".tree-file-link")?.textContent).toBe("readme.md");

    const rootFiles = container.querySelectorAll(":scope > .tree-file");
    expect(rootFiles).toHaveLength(1);
    expect(rootFiles[0].querySelector(".tree-file-link")?.textContent).toBe("root-file.txt");

    expect(await formatHTML(container.innerHTML)).toMatchInlineSnapshot(`
      "<details style="padding-left: 0px">
        <summary class="tree-dir">
          <span class="tree-dir-content"
            ><span class="tree-icon">▶</span
            ><span class="tree-dir-name">docs</span></span
          ><button
            class="tree-upload-btn btn-xs"
            title="Upload to this folder"
            aria-label="Upload to docs folder"
          >
            ↑
          </button>
        </summary>
        <div>
          <div class="tree-file" style="padding-left: 20px">
            <a
              href="/manage/download/doc2?userId=user123&amp;signature=abc123&amp;expiresAt=9999999999"
              class="tree-file-link"
              download="guide.pdf"
              >guide.pdf</a
            ><button
              class="tree-file-rename btn-xs"
              title="Rename/move file"
              aria-label="Rename/move guide.pdf"
            >
              ✎</button
            ><button
              class="tree-file-delete btn-xs"
              title="Delete file"
              aria-label="Delete guide.pdf"
            >
              ✕
            </button>
          </div>
          <div class="tree-file" style="padding-left: 20px">
            <a
              href="/manage/download/doc1?userId=user123&amp;signature=abc123&amp;expiresAt=9999999999"
              class="tree-file-link"
              download="readme.md"
              >readme.md</a
            ><button
              class="tree-file-rename btn-xs"
              title="Rename/move file"
              aria-label="Rename/move readme.md"
            >
              ✎</button
            ><button
              class="tree-file-delete btn-xs"
              title="Delete file"
              aria-label="Delete readme.md"
            >
              ✕
            </button>
          </div>
        </div>
      </details>
      <div class="tree-file" style="padding-left: 0px">
        <a
          href="/manage/download/root1?userId=user123&amp;signature=abc123&amp;expiresAt=9999999999"
          class="tree-file-link"
          download="root-file.txt"
          >root-file.txt</a
        ><button
          class="tree-file-rename btn-xs"
          title="Rename/move file"
          aria-label="Rename/move root-file.txt"
        >
          ✎</button
        ><button
          class="tree-file-delete btn-xs"
          title="Delete file"
          aria-label="Delete root-file.txt"
        >
          ✕
        </button>
      </div>
      "
    `);
  });
});
