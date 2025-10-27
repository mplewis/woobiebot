import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createE2ETestContext, type E2ETestContext } from "./testHelpers.js";

let ctx: E2ETestContext;

beforeEach(async () => {
  ctx = await createE2ETestContext({ testName: "api" });
});

afterEach(async () => {
  await ctx.cleanup();
});

it("returns captcha data from API endpoint", async () => {
  const fileName = "test-file.txt";
  const fileContent = "Test file for API";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, fileContent);
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const fileId = file.id;

  const downloadUrl = ctx.server.generateDownloadUrl(userId, fileId);
  const downloadUrlObj = new URL(downloadUrl);
  const sig = downloadUrlObj.searchParams.get("signature");
  const expiresAt = downloadUrlObj.searchParams.get("expiresAt");
  const token = "test-token-123";

  if (!sig || !expiresAt) {
    throw new Error("Failed to generate download URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: `/api/captcha-data?userId=${userId}&fileId=${fileId}&token=${token}&sig=${sig}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(200);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("challenge");
  expect(data).toHaveProperty("token");
  expect(data).toHaveProperty("signature");
  expect(data).toHaveProperty("userId", userId);
  expect(data).toHaveProperty("fileId", fileId);
  expect(data.challenge).toHaveProperty("c");
  expect(data.challenge).toHaveProperty("s");
  expect(data.challenge).toHaveProperty("d");
});

it("returns 400 when captcha data API is missing parameters", async () => {
  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: "/api/captcha-data?userId=user123",
  });

  expect(response.statusCode).toBe(400);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Missing required parameters");
});

it("returns 403 when captcha data API has invalid signature", async () => {
  const expiresAt = Date.now() + 3600000;

  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: `/api/captcha-data?userId=user123&fileId=file123&token=token123&sig=invalid&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(403);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Invalid signature");
});

it("returns 404 when captcha data API requests non-existent file", async () => {
  const userId = "user123";
  const nonExistentFileId = "nonexistent-file-id";

  const downloadUrl = ctx.server.generateDownloadUrl(userId, nonExistentFileId);
  const downloadUrlObj = new URL(downloadUrl);
  const sig = downloadUrlObj.searchParams.get("signature");
  const expiresAt = downloadUrlObj.searchParams.get("expiresAt");
  const token = "test-token-123";

  if (!sig || !expiresAt) {
    throw new Error("Failed to generate download URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: `/api/captcha-data?userId=${userId}&fileId=${nonExistentFileId}&token=${token}&sig=${sig}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(404);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "File not found");
});

it("returns 403 when captcha data API has expired token", async () => {
  const fileName = "test-file.txt";
  const fileContent = "Test file for API";
  const filePath = join(ctx.tempDir, fileName);
  await writeFile(filePath, fileContent);
  await ctx.indexer.rescan();

  const files = ctx.indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const fileId = file.id;
  const downloadUrl = ctx.server.generateDownloadUrl(userId, fileId);
  const downloadUrlObj = new URL(downloadUrl);
  const sig = downloadUrlObj.searchParams.get("signature");
  const token = "test-token-123";
  const expiredTime = Date.now() - 1000;

  if (!sig) {
    throw new Error("Failed to generate download URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: `/api/captcha-data?userId=${userId}&fileId=${fileId}&token=${token}&sig=${sig}&expiresAt=${expiredTime}`,
  });

  expect(response.statusCode).toBe(403);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Authentication token has expired");
});

it("returns 400 when captcha data API has invalid expiresAt format", async () => {
  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: "/api/captcha-data?userId=user123&fileId=file123&token=token123&sig=sig123&expiresAt=not-a-number",
  });

  expect(response.statusCode).toBe(400);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Invalid expiration timestamp");
});

it("returns manage data from API endpoint", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const manageUrlObj = new URL(manageUrl);
  const signature = manageUrlObj.searchParams.get("signature");
  const expiresAt = manageUrlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: `/api/manage-data?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(200);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("userId", userId);
  expect(data).toHaveProperty("signature", signature);
  expect(data).toHaveProperty("expiresAt", Number.parseInt(expiresAt, 10));
  expect(data).toHaveProperty("directoryTree");
  expect(typeof data.directoryTree).toBe("object");
});

it("returns 400 when manage data API is missing parameters", async () => {
  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: "/api/manage-data?userId=user123",
  });

  expect(response.statusCode).toBe(400);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Missing required parameters");
});

it("returns 403 when manage data API has invalid signature", async () => {
  const expiresAt = Date.now() + 3600000;

  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: `/api/manage-data?userId=user123&signature=invalid&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(403);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Invalid authentication signature");
});

it("returns 403 when manage data API has expired token", async () => {
  const userId = "user123";
  const expiredTime = Date.now() - 1000;
  const manageUrl = ctx.server.generateManageUrl(userId);
  const manageUrlObj = new URL(manageUrl);
  const signature = manageUrlObj.searchParams.get("signature");

  if (!signature) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: `/api/manage-data?userId=${userId}&signature=${signature}&expiresAt=${expiredTime}`,
  });

  expect(response.statusCode).toBe(403);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Authentication token has expired");
});

it("returns 400 when manage data API has invalid expiresAt format", async () => {
  const response = await ctx.server.getApp().inject({
    method: "GET",
    url: "/api/manage-data?userId=user123&signature=sig123&expiresAt=not-a-number",
  });

  expect(response.statusCode).toBe(400);
  const data = JSON.parse(response.body);
  expect(data).toHaveProperty("error", "Invalid expiration timestamp");
});
