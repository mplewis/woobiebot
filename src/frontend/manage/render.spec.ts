import prettier from "prettier";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthData, DirectoryTree } from "../../shared/types.js";
import { collapseAll, expandAll, renderDirectoryTree } from "./render.js";

vi.mock("./directoryState.js", () => ({
  getAllTreePaths: vi.fn(() => new Set(["folder1", "folder2"])),
  saveExpandedDirectories: vi.fn(),
  isExpandedDirectory: vi.fn(() => false),
  toggleDirectoryState: vi.fn(),
  cleanupDeletedDirectories: vi.fn(),
}));

const TEST_DATE = new Date("2024-01-01T00:00:00Z");

describe("renderDirectoryTree", () => {
  let container: HTMLElement;
  let mockAuthData: AuthData;
  let mockOnUpload: ReturnType<typeof vi.fn>;
  let mockOnRename: ReturnType<typeof vi.fn>;
  let mockOnDelete: ReturnType<typeof vi.fn>;

  async function formatHTML(html: string): Promise<string> {
    return await prettier.format(html, { parser: "html" });
  }

  beforeEach(() => {
    mockAuthData = { userId: "user123", signature: "abc123", expiresAt: 9999999999 };
    container = document.createElement("div");
    mockOnUpload = vi.fn();
    mockOnRename = vi.fn();
    mockOnDelete = vi.fn();
  });

  it("renders empty tree message", async () => {
    renderDirectoryTree(
      {},
      container,
      mockAuthData,
      0,
      [],
      mockOnUpload,
      mockOnRename,
      mockOnDelete,
    );

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

    renderDirectoryTree(
      tree,
      container,
      mockAuthData,
      0,
      [],
      mockOnUpload,
      mockOnRename,
      mockOnDelete,
    );

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

    renderDirectoryTree(
      tree,
      container,
      mockAuthData,
      0,
      [],
      mockOnUpload,
      mockOnRename,
      mockOnDelete,
    );

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

    renderDirectoryTree(
      tree,
      container,
      mockAuthData,
      0,
      [],
      mockOnUpload,
      mockOnRename,
      mockOnDelete,
    );

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

    renderDirectoryTree(
      tree,
      container,
      mockAuthData,
      0,
      [],
      mockOnUpload,
      mockOnRename,
      mockOnDelete,
    );

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

    renderDirectoryTree(
      tree,
      container,
      mockAuthData,
      0,
      [],
      mockOnUpload,
      mockOnRename,
      mockOnDelete,
    );

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

describe("expandAll", () => {
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
    const tree: DirectoryTree = {};
    const allDetails = document.querySelectorAll("#file-tree details");
    allDetails.forEach((detail) => {
      (detail as HTMLDetailsElement).open = false;
    });

    expandAll(tree);

    allDetails.forEach((detail) => {
      expect((detail as HTMLDetailsElement).open).toBe(true);
    });
  });
});

describe("collapseAll", () => {
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
