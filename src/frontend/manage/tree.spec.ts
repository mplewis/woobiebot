import { describe, expect, it } from "vitest";
import type { DirectoryTree, FileMetadata } from "../../shared/types.js";
import { isTreeEmpty, sortTreeEntries } from "./tree.js";

const TEST_DATE = new Date("2024-01-01T00:00:00Z");

describe("sortTreeEntries", () => {
  it("returns empty array for empty tree", () => {
    expect(sortTreeEntries({})).toEqual([]);
  });

  it("sorts directories alphabetically", () => {
    const tree: DirectoryTree = {
      zebra: {},
      apple: {},
      middle: {},
    };

    const result = sortTreeEntries(tree);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "directory", name: "apple", value: {} });
    expect(result[1]).toEqual({ type: "directory", name: "middle", value: {} });
    expect(result[2]).toEqual({ type: "directory", name: "zebra", value: {} });
  });

  it("sorts files alphabetically", () => {
    const files: FileMetadata[] = [
      {
        id: "3",
        name: "zebra.txt",
        path: "zebra.txt",
        absolutePath: "/test/zebra.txt",
        size: 100,
        mtime: TEST_DATE,
        mimeType: "text/plain",
      },
      {
        id: "1",
        name: "apple.txt",
        path: "apple.txt",
        absolutePath: "/test/apple.txt",
        size: 100,
        mtime: TEST_DATE,
        mimeType: "text/plain",
      },
      {
        id: "2",
        name: "middle.txt",
        path: "middle.txt",
        absolutePath: "/test/middle.txt",
        size: 100,
        mtime: TEST_DATE,
        mimeType: "text/plain",
      },
    ];

    const tree: DirectoryTree = {
      _files: files,
    };

    const result = sortTreeEntries(tree);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("files");
    if (result[0].type === "files") {
      expect(result[0].files).toEqual([
        {
          id: "1",
          name: "apple.txt",
          path: "apple.txt",
          absolutePath: "/test/apple.txt",
          size: 100,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
        {
          id: "2",
          name: "middle.txt",
          path: "middle.txt",
          absolutePath: "/test/middle.txt",
          size: 100,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
        {
          id: "3",
          name: "zebra.txt",
          path: "zebra.txt",
          absolutePath: "/test/zebra.txt",
          size: 100,
          mtime: TEST_DATE,
          mimeType: "text/plain",
        },
      ]);
    }
  });

  it("puts directories before files", () => {
    const files: FileMetadata[] = [
      {
        id: "1",
        name: "file.txt",
        path: "file.txt",
        absolutePath: "/test/file.txt",
        size: 100,
        mtime: TEST_DATE,
        mimeType: "text/plain",
      },
    ];

    const tree: DirectoryTree = {
      _files: files,
      directory: {},
    };

    const result = sortTreeEntries(tree);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("directory");
    expect(result[1].type).toBe("files");
  });

  it("handles tree with nested directories", () => {
    const tree: DirectoryTree = {
      parent: {
        child: {},
      },
    };

    const result = sortTreeEntries(tree);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "directory",
      name: "parent",
      value: { child: {} },
    });
  });

  it("does not mutate input files array", () => {
    const files: FileMetadata[] = [
      {
        id: "2",
        name: "z.txt",
        path: "z.txt",
        absolutePath: "/test/z.txt",
        size: 100,
        mtime: TEST_DATE,
        mimeType: "text/plain",
      },
      {
        id: "1",
        name: "a.txt",
        path: "a.txt",
        absolutePath: "/test/a.txt",
        size: 100,
        mtime: TEST_DATE,
        mimeType: "text/plain",
      },
    ];

    const tree: DirectoryTree = {
      _files: files,
    };

    sortTreeEntries(tree);

    expect(files[0].id).toBe("2");
    expect(files[1].id).toBe("1");
  });

  it("handles mixed case directory names", () => {
    const tree: DirectoryTree = {
      Zebra: {},
      apple: {},
      MIDDLE: {},
    };

    const result = sortTreeEntries(tree);

    expect(result[0].type).toBe("directory");
    expect(result[1].type).toBe("directory");
    expect(result[2].type).toBe("directory");
    if (result[0].type === "directory") {
      expect(result[0].name).toBe("apple");
    }
    if (result[1].type === "directory") {
      expect(result[1].name).toBe("MIDDLE");
    }
    if (result[2].type === "directory") {
      expect(result[2].name).toBe("Zebra");
    }
  });

  it("handles special characters in names", () => {
    const tree: DirectoryTree = {
      _underscore: {},
      normal: {},
      "01-numbers": {},
    };

    const result = sortTreeEntries(tree);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("directory");
    expect(result[1].type).toBe("directory");
    expect(result[2].type).toBe("directory");
    if (result[0].type === "directory") {
      expect(result[0].name).toBe("_underscore");
    }
    if (result[1].type === "directory") {
      expect(result[1].name).toBe("01-numbers");
    }
    if (result[2].type === "directory") {
      expect(result[2].name).toBe("normal");
    }
  });
});

describe("isTreeEmpty", () => {
  it("returns true for null", () => {
    expect(isTreeEmpty(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isTreeEmpty(undefined)).toBe(true);
  });

  it("returns true for empty object", () => {
    expect(isTreeEmpty({})).toBe(true);
  });

  it("returns false for tree with directories", () => {
    expect(isTreeEmpty({ directory: {} })).toBe(false);
  });

  it("returns false for tree with files", () => {
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
    expect(isTreeEmpty(tree)).toBe(false);
  });

  it("returns false for tree with both directories and files", () => {
    const tree: DirectoryTree = {
      directory: {},
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
    expect(isTreeEmpty(tree)).toBe(false);
  });
});
