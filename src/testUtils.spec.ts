import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestFiles } from "./testUtils.js";

const TEST_DIR = join(process.cwd(), "tmp", "test-utils-temp");

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

it("creates empty files in base directory", async () => {
  await createTestFiles(TEST_DIR, ["file1.txt", "file2.pdf"]);

  const file1 = await readFile(join(TEST_DIR, "file1.txt"), "utf-8");
  const file2 = await readFile(join(TEST_DIR, "file2.pdf"), "utf-8");

  expect(file1).toBe("");
  expect(file2).toBe("");
});

it("creates empty files in subdirectories", async () => {
  await createTestFiles(TEST_DIR, ["subdir/file.txt", "another/nested/file.pdf"]);

  const file1 = await readFile(join(TEST_DIR, "subdir/file.txt"), "utf-8");
  const file2 = await readFile(join(TEST_DIR, "another/nested/file.pdf"), "utf-8");

  expect(file1).toBe("");
  expect(file2).toBe("");
});

it("handles complex directory structures", async () => {
  await createTestFiles(TEST_DIR, [
    "patterns/amigurumi/dragon.pdf",
    "patterns/accessories/hat.pdf",
    "creatures/dragon-scales.pdf",
    "dragon.pdf",
  ]);

  const file1 = await readFile(join(TEST_DIR, "patterns/amigurumi/dragon.pdf"), "utf-8");
  const file2 = await readFile(join(TEST_DIR, "patterns/accessories/hat.pdf"), "utf-8");
  const file3 = await readFile(join(TEST_DIR, "creatures/dragon-scales.pdf"), "utf-8");
  const file4 = await readFile(join(TEST_DIR, "dragon.pdf"), "utf-8");

  expect(file1).toBe("");
  expect(file2).toBe("");
  expect(file3).toBe("");
  expect(file4).toBe("");
});

it("creates all files in parallel", async () => {
  const startTime = Date.now();
  await createTestFiles(
    TEST_DIR,
    Array.from({ length: 50 }, (_, i) => `file${i}.txt`),
  );
  const endTime = Date.now();

  const allFiles = await Promise.all(
    Array.from({ length: 50 }, (_, i) => readFile(join(TEST_DIR, `file${i}.txt`), "utf-8")),
  );

  expect(allFiles).toHaveLength(50);
  expect(allFiles.every((content) => content === "")).toBe(true);
  expect(endTime - startTime).toBeLessThan(1000);
});

it("handles empty file list", async () => {
  await createTestFiles(TEST_DIR, []);
});
