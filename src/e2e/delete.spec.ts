import { access, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createE2ETestContext, type E2ETestContext } from "./testHelpers.js";

let ctx: E2ETestContext;

beforeEach(async () => {
  ctx = await createE2ETestContext({ testName: "delete" });
});

afterEach(async () => {
  await ctx.cleanup();
});

it("deletes file successfully", async () => {
  const fileName = "test-delete.txt";
  const fileContent = "File to be deleted";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, fileContent);
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.message).toBe("File deleted successfully");

  await expect(access(filePath)).rejects.toThrow();

  const hiddenFilePath = join(ctx.tempDir, `.${fileName}`);
  await expect(access(hiddenFilePath)).resolves.toBeUndefined();

  const filesAfterDelete = ctx.indexer.getAll();
  const deletedFile = filesAfterDelete.find((f) => f.name === fileName);
  expect(deletedFile).toBeUndefined();
});

it("returns 400 when authentication parameters are missing", async () => {
  const fileName = "test-file.txt";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, "content");
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const response = await ctx.server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}`,
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: "Invalid request parameters" });
});

it("returns 400 when expiration timestamp is invalid", async () => {
  const fileName = "test-file.txt";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, "content");
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  if (!signature) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=not-a-number`,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Invalid authentication signature" });
});

it("returns 403 when authentication token has expired", async () => {
  const fileName = "test-file.txt";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, "content");
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const expiredTimestamp = Date.now() - 1000;
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  if (!signature) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=${expiredTimestamp}`,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Authentication token has expired" });
});

it("returns 403 when signature is invalid", async () => {
  const fileName = "test-file.txt";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, "content");
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=invalid-signature&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Invalid authentication signature" });
});

it("returns 404 when file not found in index", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const nonExistentFileId = "nonexistent-file-id";

  const response = await ctx.server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${nonExistentFileId}?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: "File not found" });
});

it("returns 500 when file in index but not on disk", async () => {
  const fileName = "test-file.txt";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, "content");
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  await rm(filePath);

  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(500);
  expect(response.json()).toEqual({ error: "File temporarily unavailable" });
});
