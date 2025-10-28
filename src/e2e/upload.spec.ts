import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createE2ETestContext, type E2ETestContext } from "./testHelpers.js";

let ctx: E2ETestContext;

/**
 * Creates a multipart form data payload for upload testing.
 */
function createMultipartFormData(
  fields: Record<string, string>,
  file?: { filename: string; content: string | Buffer },
): { payload: string; headers: Record<string, string> } {
  const boundary = `----WebKitFormBoundary${Date.now()}`;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    parts.push(`${value}\r\n`);
  }

  if (file) {
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n`);
    parts.push(`Content-Type: application/octet-stream\r\n\r\n`);
    const content =
      typeof file.content === "string" ? file.content : file.content.toString("binary");
    parts.push(content);
    parts.push(`\r\n`);
  }

  parts.push(`--${boundary}--\r\n`);

  return {
    payload: parts.join(""),
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  };
}

beforeEach(async () => {
  ctx = await createE2ETestContext({ testName: "upload" });
});

afterEach(async () => {
  await ctx.cleanup();
});

it("uploads file successfully to root directory", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "Test file content";
  const fileName = "test-upload.txt";

  const { payload, headers } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.filename).toBe(fileName);
  expect(body.path).toBe(fileName);

  const uploadedFilePath = join(ctx.tempDir, fileName);
  await expect(access(uploadedFilePath)).resolves.toBeUndefined();
  const uploadedContent = await readFile(uploadedFilePath, "utf-8");
  expect(uploadedContent).toBe(fileContent);

  const files = ctx.indexer.getAll();
  const uploadedFile = files.find((f) => f.name === fileName);
  expect(uploadedFile).toBeDefined();
});

it("uploads file successfully to subdirectory", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "Test file in subdirectory";
  const fileName = "nested-test.txt";
  const targetDir = "subdir/nested";

  const { payload, headers } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
      directory: targetDir,
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.filename).toBe(fileName);
  expect(body.path).toBe(`${targetDir}/${fileName}`);

  const uploadedFilePath = join(ctx.tempDir, targetDir, fileName);
  await expect(access(uploadedFilePath)).resolves.toBeUndefined();
  const uploadedContent = await readFile(uploadedFilePath, "utf-8");
  expect(uploadedContent).toBe(fileContent);
});

it("returns 400 when no file is provided", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const { payload, headers } = createMultipartFormData({
    userId,
    signature,
    expiresAt,
  });

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: "No file provided" });
});

it("returns 400 when authentication data is missing", async () => {
  const fileContent = "Test file content";
  const fileName = "test-upload.txt";

  const { payload, headers } = createMultipartFormData(
    {
      userId: "user123",
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: "Invalid form data" });
});

it("returns 403 when authentication token has expired", async () => {
  const userId = "user123";
  const expiredTimestamp = Date.now() - 1000;
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  if (!signature) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "Test file content";
  const fileName = "test-upload.txt";

  const { payload, headers } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt: expiredTimestamp.toString(),
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Authentication token has expired" });
});

it("returns 403 when signature is invalid", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "Test file content";
  const fileName = "test-upload.txt";

  const { payload, headers } = createMultipartFormData(
    {
      userId,
      signature: "invalid-signature",
      expiresAt,
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Invalid authentication signature" });
});

it("sanitizes path and prevents directory traversal", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "Malicious content";
  const fileName = "evil.txt";
  const maliciousPath = "../../../etc";

  const { payload, headers } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
      directory: maliciousPath,
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);

  const sanitizedPath = "etc";
  expect(body.path).toBe(`${sanitizedPath}/${fileName}`);

  const uploadedFilePath = join(ctx.tempDir, sanitizedPath, fileName);
  await expect(access(uploadedFilePath)).resolves.toBeUndefined();

  const outsideTempDir = join(ctx.tempDir, "..", "..", "..", "etc", fileName);
  await expect(access(outsideTempDir)).rejects.toThrow();
});

it("rejects file with disallowed extension", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "Test file with invalid extension";
  const fileName = "test-file.xyz";

  const { payload, headers } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(400);
  const body = response.json();
  expect(body.error).toContain("File type .xyz is not allowed");
  expect(body.error).toContain("Allowed types:");
});

it("accepts file with allowed extension (case insensitive)", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "Test file with uppercase extension";
  const fileName = "test-file.TXT";

  const { payload, headers } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.filename).toBe(fileName);
});

it("auto-renames file when duplicate exists", async () => {
  const userId = "user123";
  const manageUrl = ctx.server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const fileContent = "First upload";
  const fileName = "duplicate.txt";

  const { payload: payload1, headers: headers1 } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
    },
    {
      filename: fileName,
      content: fileContent,
    },
  );

  const response1 = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers: headers1,
    payload: payload1,
  });

  expect(response1.statusCode).toBe(200);
  const body1 = response1.json();
  expect(body1.success).toBe(true);
  expect(body1.filename).toBe(fileName);

  const { payload: payload2, headers: headers2 } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
    },
    {
      filename: fileName,
      content: "Second upload",
    },
  );

  const response2 = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers: headers2,
    payload: payload2,
  });

  expect(response2.statusCode).toBe(200);
  const body2 = response2.json();
  expect(body2.success).toBe(true);
  expect(body2.filename).toBe("duplicate_1.txt");

  const { payload: payload3, headers: headers3 } = createMultipartFormData(
    {
      userId,
      signature,
      expiresAt,
    },
    {
      filename: fileName,
      content: "Third upload",
    },
  );

  const response3 = await ctx.server.getApp().inject({
    method: "POST",
    url: "/manage/upload",
    headers: headers3,
    payload: payload3,
  });

  expect(response3.statusCode).toBe(200);
  const body3 = response3.json();
  expect(body3.success).toBe(true);
  expect(body3.filename).toBe("duplicate_2.txt");

  const uploadedFilePath1 = join(ctx.tempDir, fileName);
  const uploadedFilePath2 = join(ctx.tempDir, "duplicate_1.txt");
  const uploadedFilePath3 = join(ctx.tempDir, "duplicate_2.txt");

  await expect(access(uploadedFilePath1)).resolves.toBeUndefined();
  await expect(access(uploadedFilePath2)).resolves.toBeUndefined();
  await expect(access(uploadedFilePath3)).resolves.toBeUndefined();

  const content1 = await readFile(uploadedFilePath1, "utf-8");
  const content2 = await readFile(uploadedFilePath2, "utf-8");
  const content3 = await readFile(uploadedFilePath3, "utf-8");

  expect(content1).toBe("First upload");
  expect(content2).toBe("Second upload");
  expect(content3).toBe("Third upload");
});
