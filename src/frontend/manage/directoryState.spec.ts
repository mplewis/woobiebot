import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryTree } from "../../shared/types.js";
import {
  cleanupDeletedDirectories,
  getAllTreePaths,
  getExpandedDirectories,
  isExpandedDirectory,
  saveExpandedDirectories,
  toggleDirectoryState,
} from "./directoryState.js";

const STORAGE_KEY = "dir_expand_state";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("getExpandedDirectories", () => {
  it("returns empty set when no data stored", () => {
    const result = getExpandedDirectories();
    expect(result.size).toBe(0);
  });

  it("returns stored directories", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ expandedDirectories: ["dir1", "dir2/subdir"] }),
    );
    const result = getExpandedDirectories();
    expect(result.size).toBe(2);
    expect(result.has("dir1")).toBe(true);
    expect(result.has("dir2/subdir")).toBe(true);
  });

  it("handles corrupted data gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "invalid json");
    const result = getExpandedDirectories();
    expect(result.size).toBe(0);
  });
});

describe("saveExpandedDirectories", () => {
  it("saves directories to localStorage", () => {
    const dirs = new Set(["dir1", "dir2/subdir"]);
    saveExpandedDirectories(dirs);

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeDefined();
    if (stored) {
      const data = JSON.parse(stored);
      expect(data.expandedDirectories).toEqual(["dir1", "dir2/subdir"]);
    }
  });

  it("saves empty set", () => {
    saveExpandedDirectories(new Set());

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeDefined();
    if (stored) {
      const data = JSON.parse(stored);
      expect(data.expandedDirectories).toEqual([]);
    }
  });
});

describe("isExpandedDirectory", () => {
  it("returns false when directory not in storage", () => {
    expect(isExpandedDirectory("dir1")).toBe(false);
  });

  it("returns true when directory is in storage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ expandedDirectories: ["dir1"] }));
    expect(isExpandedDirectory("dir1")).toBe(true);
  });

  it("returns false for different directory", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ expandedDirectories: ["dir1"] }));
    expect(isExpandedDirectory("dir2")).toBe(false);
  });
});

describe("toggleDirectoryState", () => {
  it("adds directory when toggled open", () => {
    toggleDirectoryState("dir1", true);

    const dirs = getExpandedDirectories();
    expect(dirs.has("dir1")).toBe(true);
  });

  it("removes directory when toggled closed", () => {
    saveExpandedDirectories(new Set(["dir1", "dir2"]));

    toggleDirectoryState("dir1", false);

    const dirs = getExpandedDirectories();
    expect(dirs.has("dir1")).toBe(false);
    expect(dirs.has("dir2")).toBe(true);
  });

  it("handles toggling non-existent directory closed", () => {
    toggleDirectoryState("dir1", false);

    const dirs = getExpandedDirectories();
    expect(dirs.has("dir1")).toBe(false);
  });
});

describe("getAllTreePaths", () => {
  it("returns empty set for empty tree", () => {
    const tree: DirectoryTree = {};
    const paths = getAllTreePaths(tree);
    expect(paths.size).toBe(0);
  });

  it("returns paths for single level directories", () => {
    const tree: DirectoryTree = {
      dir1: {},
      dir2: {},
    };
    const paths = getAllTreePaths(tree);
    expect(paths.size).toBe(2);
    expect(paths.has("dir1")).toBe(true);
    expect(paths.has("dir2")).toBe(true);
  });

  it("returns nested directory paths", () => {
    const tree: DirectoryTree = {
      dir1: {
        subdir1: {},
        subdir2: {},
      },
      dir2: {},
    };
    const paths = getAllTreePaths(tree);
    expect(paths.size).toBe(4);
    expect(paths.has("dir1")).toBe(true);
    expect(paths.has("dir1/subdir1")).toBe(true);
    expect(paths.has("dir1/subdir2")).toBe(true);
    expect(paths.has("dir2")).toBe(true);
  });

  it("ignores _files property", () => {
    const tree: DirectoryTree = {
      dir1: {},
      _files: [],
    };
    const paths = getAllTreePaths(tree);
    expect(paths.size).toBe(1);
    expect(paths.has("dir1")).toBe(true);
    expect(paths.has("_files")).toBe(false);
  });

  it("handles deeply nested directories", () => {
    const tree: DirectoryTree = {
      dir1: {
        subdir1: {
          deepdir: {},
        },
      },
    };
    const paths = getAllTreePaths(tree);
    expect(paths.size).toBe(3);
    expect(paths.has("dir1")).toBe(true);
    expect(paths.has("dir1/subdir1")).toBe(true);
    expect(paths.has("dir1/subdir1/deepdir")).toBe(true);
  });
});

describe("error handling", () => {
  it("handles localStorage.getItem errors gracefully", () => {
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = vi.fn().mockImplementation(() => {
      throw new Error("Storage error");
    });

    const result = getExpandedDirectories();
    expect(result.size).toBe(0);

    localStorage.getItem = originalGetItem;
  });

  it("handles localStorage.setItem errors gracefully", () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = vi.fn().mockImplementation(() => {
      throw new Error("Storage error");
    });

    expect(() => saveExpandedDirectories(new Set(["dir1"]))).not.toThrow();

    localStorage.setItem = originalSetItem;
  });
});

describe("cleanupDeletedDirectories", () => {
  it("removes non-existent directories from storage", () => {
    saveExpandedDirectories(new Set(["dir1", "dir2", "deleted"]));

    const tree: DirectoryTree = {
      dir1: {},
      dir2: {},
    };

    cleanupDeletedDirectories(tree);

    const dirs = getExpandedDirectories();
    expect(dirs.size).toBe(2);
    expect(dirs.has("dir1")).toBe(true);
    expect(dirs.has("dir2")).toBe(true);
    expect(dirs.has("deleted")).toBe(false);
  });

  it("keeps all directories when all exist", () => {
    saveExpandedDirectories(new Set(["dir1", "dir2"]));

    const tree: DirectoryTree = {
      dir1: {},
      dir2: {},
      dir3: {},
    };

    cleanupDeletedDirectories(tree);

    const dirs = getExpandedDirectories();
    expect(dirs.size).toBe(2);
    expect(dirs.has("dir1")).toBe(true);
    expect(dirs.has("dir2")).toBe(true);
  });

  it("does not modify storage when no cleanup needed", () => {
    saveExpandedDirectories(new Set(["dir1"]));

    const tree: DirectoryTree = {
      dir1: {},
    };

    const beforeCleanup = localStorage.getItem(STORAGE_KEY);
    cleanupDeletedDirectories(tree);
    const afterCleanup = localStorage.getItem(STORAGE_KEY);

    expect(beforeCleanup).toBe(afterCleanup);
  });

  it("handles nested directory cleanup", () => {
    saveExpandedDirectories(new Set(["dir1", "dir1/subdir", "dir1/deleted"]));

    const tree: DirectoryTree = {
      dir1: {
        subdir: {},
      },
    };

    cleanupDeletedDirectories(tree);

    const dirs = getExpandedDirectories();
    expect(dirs.size).toBe(2);
    expect(dirs.has("dir1")).toBe(true);
    expect(dirs.has("dir1/subdir")).toBe(true);
    expect(dirs.has("dir1/deleted")).toBe(false);
  });
});
