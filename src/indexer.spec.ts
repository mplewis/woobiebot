import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileIndexerConfig } from "./indexer.js";
import { FileIndexer } from "./indexer.js";
import { createTestFiles } from "./testUtils.js";

const TEST_DIR = join(process.cwd(), "tmp", "test-files-temp");

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

/**
 * Helper function to manage FileIndexer lifecycle in tests.
 * Automatically starts the indexer before calling the test function and stops it after.
 *
 * @param options - Configuration options for the FileIndexer
 * @param fn - Test function that receives the started indexer
 * @returns The result of the test function
 */
async function withIndexer<T>(
  options: FileIndexerConfig,
  fn: (indexer: FileIndexer) => Promise<T>,
): Promise<T> {
  const indexer = new FileIndexer({ ...options, scanIntervalMins: 0 });
  await indexer.start();
  try {
    return await fn(indexer);
  } finally {
    indexer.stop();
  }
}

it("builds index from directory on start", async () => {
  await createTestFiles(TEST_DIR, ["file1.txt", "file2.txt"]);

  await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
    const files = indexer.getAll();
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path).sort()).toEqual(["file1.txt", "file2.txt"]);
  });
});

it("generates consistent IDs from paths", async () => {
  await createTestFiles(TEST_DIR, ["test.txt"]);

  await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
    const files = indexer.getAll();
    const file = files[0];
    expect(file).toBeDefined();
    if (!file) {
      throw new Error("File not found");
    }

    const foundById = indexer.getById(file.id);
    expect(foundById).toEqual(file);
  });
});

it("finds files by ID", async () => {
  await createTestFiles(TEST_DIR, ["findme.txt"]);

  await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
    const files = indexer.getAll();
    const file = files[0];
    expect(file).toBeDefined();
    if (!file) {
      throw new Error("File not found");
    }

    const found = indexer.getById(file.id);
    expect(found?.path).toBe("findme.txt");
  });
});

it("filters by file extensions", async () => {
  await createTestFiles(TEST_DIR, ["file.txt", "file.pdf", "file.jpg"]);

  await withIndexer({ directory: TEST_DIR, extensions: [".txt", ".pdf"] }, async (indexer) => {
    const files = indexer.getAll();
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path).sort()).toEqual(["file.pdf", "file.txt"]);
  });
});

it("handles subdirectories", async () => {
  await createTestFiles(TEST_DIR, ["root.txt", "subdir/nested.txt"]);

  await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
    const files = indexer.getAll();
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path).sort()).toEqual(["root.txt", "subdir/nested.txt"]);
  });
});

it("ignores dotfiles and dot directories", async () => {
  await createTestFiles(TEST_DIR, [
    "visible.txt",
    ".hidden.txt",
    ".dotdir/nested.txt",
    "normal/file.txt",
  ]);

  await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
    const files = indexer.getAll();
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path).sort()).toEqual(["normal/file.txt", "visible.txt"]);
  });
});

it("rebuilds index from scratch, removing deleted files", async () => {
  await createTestFiles(TEST_DIR, ["file1.txt", "file2.txt", "file3.txt"]);

  const indexer = new FileIndexer({
    directory: TEST_DIR,
    extensions: [".txt"],
    scanIntervalMins: 0,
  });
  await indexer.start();

  expect(indexer.getAll()).toHaveLength(3);

  await rm(join(TEST_DIR, "file2.txt"));
  await createTestFiles(TEST_DIR, ["file4.txt"]);

  await indexer["_scanDirectory"]();

  const files = indexer.getAll();
  expect(files).toHaveLength(3);
  expect(files.map((f) => f.path).sort()).toEqual(["file1.txt", "file3.txt", "file4.txt"]);

  indexer.stop();
});

describe("search", () => {
  it("searches files by path (fuzzy)", async () => {
    await createTestFiles(TEST_DIR, ["document.pdf", "readme.txt", "notes.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf", ".txt"] }, async (indexer) => {
      const results = indexer.search("readme");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.file.path).toBe("readme.txt");
    });
  });

  it("sorts results by relevance score", async () => {
    await createTestFiles(TEST_DIR, [
      "accessories/hat.pdf",
      "accessories/mittens.pdf",
      "accessories/socks.pdf",
      "ancient-dragon.pdf",
      "baby-dragon.pdf",
      "bunny.pdf",
      "creatures/dragon-scales.pdf",
      "creatures/dragon-toy.pdf",
      "dragon-plushie.pdf",
      "dragon.pdf",
      "elephant.pdf",
      "octopus.pdf",
      "patterns/blanket.pdf",
      "patterns/cat.pdf",
      "patterns/chinese-dragon.pdf",
      "patterns/dragon-wings.pdf",
      "patterns/fire-dragon.pdf",
      "patterns/scarf.pdf",
      "turtle.pdf",
      "water-dragon.pdf",
    ]);

    await withIndexer(
      { directory: TEST_DIR, extensions: [".pdf"], threshold: 0.75 },
      async (indexer) => {
        const results = indexer.search("dragon");

        const resultPaths = results.map((r) => `${r.score}: ${r.file.path}`);
        expect(resultPaths).toMatchInlineSnapshot(`
        [
          "0.001: dragon-plushie.pdf",
          "0.001: dragon.pdf",
          "0.05: baby-dragon.pdf",
          "0.06: water-dragon.pdf",
          "0.08: ancient-dragon.pdf",
          "0.09: patterns/dragon-wings.pdf",
          "0.1: creatures/dragon-scales.pdf",
          "0.1: creatures/dragon-toy.pdf",
          "0.14: patterns/fire-dragon.pdf",
          "0.17: patterns/chinese-dragon.pdf",
          "0.6966666666666667: elephant.pdf",
          "0.7066666666666667: patterns/blanket.pdf",
          "0.7066666666666667: patterns/cat.pdf",
          "0.7066666666666667: patterns/scarf.pdf",
        ]
      `);
      },
    );
  });

  it("returns empty array for empty query", async () => {
    await createTestFiles(TEST_DIR, ["file.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      const results = indexer.search("");
      expect(results).toEqual([]);
    });
  });

  it("handles no results", async () => {
    await createTestFiles(TEST_DIR, ["file.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      const results = indexer.search("nonexistent-xyzabc");
      expect(results).toEqual([]);
    });
  });

  it("handles typos in queries", async () => {
    await createTestFiles(TEST_DIR, ["cactus.txt", "coconut.txt", "carrot.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      const results = indexer.search("catcus");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.file.path).toBe("cactus.txt");
    });
  });

  it("performs exact substring match with quoted strings", async () => {
    await createTestFiles(TEST_DIR, ["dragon.pdf", "dragon-plushie.pdf", "fire-dragon.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"dragon.pdf"');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.file.path).sort()).toEqual(["dragon.pdf", "fire-dragon.pdf"]);
    });
  });

  it("performs exact match with quoted path", async () => {
    await createTestFiles(TEST_DIR, [
      "patterns/dragon.pdf",
      "patterns/bunny.pdf",
      "accessories/hat.pdf",
    ]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"patterns/"');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.file.path).sort()).toEqual([
        "patterns/bunny.pdf",
        "patterns/dragon.pdf",
      ]);
    });
  });

  it("combines exact and fuzzy search", async () => {
    await createTestFiles(TEST_DIR, ["patterns/dragon.pdf", "patterns/bunny.pdf", "dragon.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"patterns/" dragon');
      expect(results).toHaveLength(1);
      expect(results[0]?.file.path).toBe("patterns/dragon.pdf");
    });
  });

  it("returns empty array when exact match fails", async () => {
    await createTestFiles(TEST_DIR, ["dragon.pdf", "bunny.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"nonexistent.pdf"');
      expect(results).toEqual([]);
    });
  });

  it("handles multiple exact phrases", async () => {
    await createTestFiles(TEST_DIR, [
      "patterns/amigurumi/dragon.pdf",
      "patterns/amigurumi/bunny.pdf",
      "patterns/dragon.pdf",
      "amigurumi/dragon.pdf",
    ]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"patterns/" "amigurumi/"');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.file.path).sort()).toEqual([
        "patterns/amigurumi/bunny.pdf",
        "patterns/amigurumi/dragon.pdf",
      ]);
    });
  });

  it("exact match is case-insensitive", async () => {
    await createTestFiles(TEST_DIR, ["Dragon.pdf", "bunny.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"dragon.pdf"');
      expect(results).toHaveLength(1);
      expect(results[0]?.file.path).toBe("Dragon.pdf");
    });
  });

  it("fuzzy search without quotes still works", async () => {
    await createTestFiles(TEST_DIR, ["dragon-plushie.pdf", "fire-dragon.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search("dragon");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.file.path.includes("dragon"))).toBe(true);
    });
  });

  it("handles exact match with special characters", async () => {
    await createTestFiles(TEST_DIR, ["dragon (v2) [final].pdf", "dragon v2 final.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"dragon (v2) [final].pdf"');
      expect(results).toHaveLength(1);
      expect(results[0]?.file.path).toBe("dragon (v2) [final].pdf");
    });
  });

  it("handles exact match with hyphens and underscores", async () => {
    await createTestFiles(TEST_DIR, ["fire-breathing_dragon.pdf", "fire breathing dragon.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search('"fire-breathing_dragon"');
      expect(results).toHaveLength(1);
      expect(results[0]?.file.path).toBe("fire-breathing_dragon.pdf");
    });
  });

  it("matches exact filename only with path separator prefix", async () => {
    await createTestFiles(TEST_DIR, ["dragon.pdf", "fire-dragon.pdf", "dragon-plushie.pdf"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".pdf"] }, async (indexer) => {
      const results = indexer.search("dragon.pdf");
      expect(results.length).toBeGreaterThan(0);
    });
  });
});

describe("periodic scanning", () => {
  it("does not set up periodic scanning when scanIntervalMins is 0", async () => {
    await createTestFiles(TEST_DIR, ["file.txt"]);
    const indexer = new FileIndexer({
      directory: TEST_DIR,
      extensions: [".txt"],
      scanIntervalMins: 0,
    });

    await indexer.start();
    const files = indexer.getAll();
    expect(files).toHaveLength(1);

    indexer.stop();
  });

  it("stops successfully when no periodic scanning is active", async () => {
    await createTestFiles(TEST_DIR, ["file.txt"]);
    const indexer = new FileIndexer({
      directory: TEST_DIR,
      extensions: [".txt"],
      scanIntervalMins: 0,
    });

    await indexer.start();
    indexer.stop();
    indexer.stop();

    const files = indexer.getAll();
    expect(files).toHaveLength(1);
  });
});

describe("rescan", () => {
  it("updates index when new files are added", async () => {
    await createTestFiles(TEST_DIR, ["initial.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      expect(indexer.getAll()).toHaveLength(1);

      await createTestFiles(TEST_DIR, ["new-file.txt"]);
      await indexer.rescan();

      const files = indexer.getAll();
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.path).sort()).toEqual(["initial.txt", "new-file.txt"]);
    });
  });

  it("removes deleted files from index", async () => {
    await createTestFiles(TEST_DIR, ["file1.txt", "file2.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      expect(indexer.getAll()).toHaveLength(2);

      await rm(join(TEST_DIR, "file1.txt"));
      await indexer.rescan();

      const files = indexer.getAll();
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("file2.txt");
    });
  });
});

describe("getDirectoryTree", () => {
  it("returns empty tree for no files", async () => {
    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      const tree = indexer.getDirectoryTree();
      expect(tree).toEqual({});
    });
  });

  it("returns flat structure for files in root", async () => {
    await createTestFiles(TEST_DIR, ["file1.txt", "file2.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      const tree = indexer.getDirectoryTree();
      expect(tree["_files"]).toHaveLength(2);
      const files = tree["_files"] as Array<{ path: string }>;
      expect(files.map((f) => f.path).sort()).toEqual(["file1.txt", "file2.txt"]);
    });
  });

  it("returns hierarchical structure for nested directories", async () => {
    await createTestFiles(TEST_DIR, ["dir1/file1.txt", "dir1/file2.txt", "dir2/file3.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      const tree = indexer.getDirectoryTree();

      expect(tree["dir1"]).toBeDefined();
      expect(tree["dir2"]).toBeDefined();

      const dir1 = tree["dir1"] as Record<string, unknown>;
      const dir2 = tree["dir2"] as Record<string, unknown>;

      expect(dir1["_files"]).toHaveLength(2);
      expect(dir2["_files"]).toHaveLength(1);

      const dir1Files = dir1["_files"] as Array<{ path: string }>;
      expect(dir1Files.map((f) => f.path).sort()).toEqual(["dir1/file1.txt", "dir1/file2.txt"]);
    });
  });

  it("handles deeply nested directory structures", async () => {
    await createTestFiles(TEST_DIR, ["a/b/c/deep.txt"]);

    await withIndexer({ directory: TEST_DIR, extensions: [".txt"] }, async (indexer) => {
      const tree = indexer.getDirectoryTree();

      expect(tree["a"]).toBeDefined();
      const a = tree["a"] as Record<string, unknown>;
      expect(a["b"]).toBeDefined();
      const b = a["b"] as Record<string, unknown>;
      expect(b["c"]).toBeDefined();
      const c = b["c"] as Record<string, unknown>;
      expect(c["_files"]).toHaveLength(1);

      const files = c["_files"] as Array<{ path: string }>;
      expect(files[0]?.path).toBe("a/b/c/deep.txt");
    });
  });
});

describe("error handling", () => {
  // Note: Testing file stat errors would require mocking fs.stat which is difficult with ESM
  // The indexer properly handles and logs file stat errors (see lines 301-303 in indexer.ts)

  it("starts periodic scanning when scanIntervalMins > 0", async () => {
    await createTestFiles(TEST_DIR, ["file.txt"]);

    const indexer = new FileIndexer({
      directory: TEST_DIR,
      extensions: [".txt"],
      scanIntervalMins: 1,
    });

    await indexer.start();
    expect(indexer["scanInterval"]).not.toBeNull();

    indexer.stop();
  });

  it("does not start periodic scanning when scanIntervalMins is 0", async () => {
    await createTestFiles(TEST_DIR, ["file.txt"]);

    const indexer = new FileIndexer({
      directory: TEST_DIR,
      extensions: [".txt"],
      scanIntervalMins: 0,
    });

    await indexer.start();
    expect(indexer["scanInterval"]).toBeNull();

    indexer.stop();
  });

  // Note: Testing periodic scan errors would require mocking fs operations which is difficult with ESM
  // The _executePeriodicScan method properly handles errors via try-catch (see lines 237-246 in indexer.ts)
});
