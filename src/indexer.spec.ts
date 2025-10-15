import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FileIndexer } from "./indexer.js";

const TEST_DIR = join(process.cwd(), "test-files-temp");

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

it("builds index from directory on start", async () => {
  await writeFile(join(TEST_DIR, "file1.txt"), "content1");
  await writeFile(join(TEST_DIR, "file2.txt"), "content2");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const files = indexer.getAll();
  expect(files).toHaveLength(2);
  expect(files.map((f) => f.path).sort()).toEqual(["file1.txt", "file2.txt"]);

  await indexer.stop();
});

it("generates consistent IDs from paths", async () => {
  await writeFile(join(TEST_DIR, "test.txt"), "content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const files = indexer.getAll();
  const file = files[0];
  expect(file).toBeDefined();
  if (!file) {
    throw new Error("File not found");
  }

  const foundById = indexer.getById(file.id);
  expect(foundById).toEqual(file);

  await indexer.stop();
});

it("finds files by ID", async () => {
  await writeFile(join(TEST_DIR, "findme.txt"), "content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const files = indexer.getAll();
  const file = files[0];
  expect(file).toBeDefined();
  if (!file) {
    throw new Error("File not found");
  }

  const found = indexer.getById(file.id);
  expect(found?.path).toBe("findme.txt");

  await indexer.stop();
});

it("searches files by path (fuzzy)", async () => {
  await writeFile(join(TEST_DIR, "document.pdf"), "pdf content");
  await writeFile(join(TEST_DIR, "readme.txt"), "readme content");
  await writeFile(join(TEST_DIR, "notes.txt"), "notes content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".pdf", ".txt"] });
  await indexer.start();

  const results = indexer.search("readme");
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]?.file.path).toBe("readme.txt");

  await indexer.stop();
});

it("sorts search results by relevance score", async () => {
  await mkdir(join(TEST_DIR, "patterns"), { recursive: true });
  await mkdir(join(TEST_DIR, "creatures"), { recursive: true });
  await mkdir(join(TEST_DIR, "accessories"), { recursive: true });

  await writeFile(join(TEST_DIR, "accessories/hat.pdf"), "hat pattern");
  await writeFile(join(TEST_DIR, "accessories/mittens.pdf"), "mittens pattern");
  await writeFile(join(TEST_DIR, "accessories/socks.pdf"), "socks pattern");
  await writeFile(join(TEST_DIR, "ancient-dragon.pdf"), "ancient pattern");
  await writeFile(join(TEST_DIR, "baby-dragon.pdf"), "baby pattern");
  await writeFile(join(TEST_DIR, "bunny.pdf"), "bunny pattern");
  await writeFile(join(TEST_DIR, "creatures/dragon-scales.pdf"), "scales pattern");
  await writeFile(join(TEST_DIR, "creatures/dragon-toy.pdf"), "toy pattern");
  await writeFile(join(TEST_DIR, "dragon-plushie.pdf"), "plushie pattern");
  await writeFile(join(TEST_DIR, "dragon.pdf"), "dragon pattern");
  await writeFile(join(TEST_DIR, "elephant.pdf"), "elephant pattern");
  await writeFile(join(TEST_DIR, "octopus.pdf"), "octopus pattern");
  await writeFile(join(TEST_DIR, "patterns/blanket.pdf"), "blanket pattern");
  await writeFile(join(TEST_DIR, "patterns/cat.pdf"), "cat pattern");
  await writeFile(join(TEST_DIR, "patterns/chinese-dragon.pdf"), "chinese pattern");
  await writeFile(join(TEST_DIR, "patterns/dragon-wings.pdf"), "wings pattern");
  await writeFile(join(TEST_DIR, "patterns/fire-dragon.pdf"), "fire pattern");
  await writeFile(join(TEST_DIR, "patterns/scarf.pdf"), "scarf pattern");
  await writeFile(join(TEST_DIR, "turtle.pdf"), "turtle pattern");
  await writeFile(join(TEST_DIR, "water-dragon.pdf"), "water pattern");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".pdf"], threshold: 0.75 });
  await indexer.start();

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

  await indexer.stop();
});

it("filters by file extensions", async () => {
  await writeFile(join(TEST_DIR, "file.txt"), "txt content");
  await writeFile(join(TEST_DIR, "file.pdf"), "pdf content");
  await writeFile(join(TEST_DIR, "file.jpg"), "jpg content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt", ".pdf"] });
  await indexer.start();

  const files = indexer.getAll();
  expect(files).toHaveLength(2);
  expect(files.map((f) => f.path).sort()).toEqual(["file.pdf", "file.txt"]);

  await indexer.stop();
});

it.skip("automatically detects new files", async () => {
  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  expect(indexer.getAll()).toHaveLength(0);

  await new Promise((resolve) => setTimeout(resolve, 100));

  await writeFile(join(TEST_DIR, "new-file.txt"), "content");

  await new Promise((resolve) => setTimeout(resolve, 500));

  const files = indexer.getAll();
  expect(files).toHaveLength(1);
  expect(files[0]?.path).toBe("new-file.txt");

  await indexer.stop();
});

it.skip("automatically removes deleted files", async () => {
  const filePath = join(TEST_DIR, "deleteme.txt");
  await writeFile(filePath, "content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  expect(indexer.getAll()).toHaveLength(1);

  await new Promise((resolve) => setTimeout(resolve, 100));

  await rm(filePath);

  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(indexer.getAll()).toHaveLength(0);

  await indexer.stop();
});

it.skip("updates metadata on file changes", async () => {
  const filePath = join(TEST_DIR, "changeme.txt");
  await writeFile(filePath, "original");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const file1 = indexer.getAll()[0];
  const originalSize = file1?.size;
  expect(originalSize).toBeDefined();

  await new Promise((resolve) => setTimeout(resolve, 100));

  await writeFile(filePath, "updated with more content");

  await new Promise((resolve) => setTimeout(resolve, 500));

  const file2 = indexer.getAll()[0];
  expect(file2?.size).toBeGreaterThan(originalSize ?? 0);

  await indexer.stop();
});

it("handles subdirectories", async () => {
  await mkdir(join(TEST_DIR, "subdir"), { recursive: true });
  await writeFile(join(TEST_DIR, "root.txt"), "root");
  await writeFile(join(TEST_DIR, "subdir", "nested.txt"), "nested");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const files = indexer.getAll();
  expect(files).toHaveLength(2);
  expect(files.map((f) => f.path).sort()).toEqual(["root.txt", "subdir/nested.txt"]);

  await indexer.stop();
});

it("search returns empty array for empty query", async () => {
  await writeFile(join(TEST_DIR, "file.txt"), "content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const results = indexer.search("");
  expect(results).toEqual([]);

  await indexer.stop();
});

it("search handles no results", async () => {
  await writeFile(join(TEST_DIR, "file.txt"), "content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const results = indexer.search("nonexistent-xyzabc");
  expect(results).toEqual([]);

  await indexer.stop();
});

it("handles typos in search queries", async () => {
  await writeFile(join(TEST_DIR, "cactus.txt"), "content");
  await writeFile(join(TEST_DIR, "coconut.txt"), "content");
  await writeFile(join(TEST_DIR, "carrot.txt"), "content");

  const indexer = new FileIndexer({ directory: TEST_DIR, extensions: [".txt"] });
  await indexer.start();

  const results = indexer.search("catcus");
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]?.file.path).toBe("cactus.txt");

  await indexer.stop();
});
