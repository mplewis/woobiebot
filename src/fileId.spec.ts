import { expect, it } from "vitest";
import { generateFileId } from "./fileId.js";

it("generates deterministic IDs from paths", () => {
  const id = generateFileId("/path/to/file.txt");

  expect(id).toBe("cy5i58pb");
});

it("uses only a-z and 0-9 characters", () => {
  const id = generateFileId("/some/path/file.pdf");

  expect(id).toBe("6fpwd0ih");
  expect(id).toMatch(/^[a-z0-9]+$/);
});

it("generates 8 character IDs by default", () => {
  const id = generateFileId("/file.txt");

  expect(id).toBe("fi02stly");
  expect(id).toHaveLength(8);
});

it("generates custom length IDs", () => {
  const id = generateFileId("/file.txt", 16);

  expect(id).toBe("fi02stlym96tn6wt");
  expect(id).toHaveLength(16);
});

it("generates different IDs for different paths", () => {
  const id1 = generateFileId("/path/file1.txt");
  const id2 = generateFileId("/path/file2.txt");

  expect(id1).toBe("97g4nfc8");
  expect(id2).toBe("bnc4e6u8");
});

it("handles absolute and relative paths consistently", () => {
  const abs = generateFileId("/absolute/path/file.txt");
  const rel = generateFileId("relative/path/file.txt");

  expect(abs).toBe("wnkj2gqm");
  expect(rel).toBe("nsh7lpkt");
});

it("handles paths with special characters", () => {
  const id = generateFileId("/path/file-name_with.special+chars.txt");

  expect(id).toBe("dn2d93nb");
});
