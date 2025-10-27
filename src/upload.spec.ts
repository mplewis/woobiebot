import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CaptchaManager } from "./captcha.js";
import type { Config } from "./config.js";
import { FileIndexer } from "./indexer.js";
import { log } from "./logger.js";
import { RateLimiter } from "./rateLimiter.js";
import { WebServer, type WebServerDependencies } from "./webServer.js";

let server: WebServer;
let tempDir: string;
let indexer: FileIndexer;
let captchaManager: CaptchaManager;
let rateLimiter: RateLimiter;
let mockConfig: Config;

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
  tempDir = await mkdtemp(join(tmpdir(), "upload-test-"));

  mockConfig = {
    DISCORD_TOKEN: "test_token",
    DISCORD_CLIENT_ID: "test_client_id",
    DISCORD_GUILD_IDS: [],
    FILES_DIRECTORY: tempDir,
    FILE_EXTENSIONS: [".txt"],
    WEB_SERVER_PORT: 3001,
    WEB_SERVER_HOST: "127.0.0.1",
    WEB_SERVER_BASE_URL: "http://localhost:3001",
    SIGNING_SECRET: "test-signing-secret-key-must-be-long-enough",
    URL_EXPIRY_SEC: 600,
    MANAGE_URL_EXPIRY_SEC: 3600,
    CAPTCHA_CHALLENGE_COUNT: 50,
    CAPTCHA_DIFFICULTY: 4,
    DOWNLOADS_PER_HR: 10,
    RATE_LIMIT_STORAGE_DIR: "tmp/test-rate-limit-upload",
    SEARCH_MIN_CHARS: 3,
    SEARCH_THRESHOLD: 0.6,
    SCAN_INTERVAL_MINS: 15,
    MAX_FILE_SIZE_MB: 1,
    LOG_LEVEL: "error",
    NODE_ENV: "test",
  };

  captchaManager = new CaptchaManager({
    hmacSecret: mockConfig.SIGNING_SECRET,
    challengeCount: 3,
    challengeDifficulty: 2,
    expiresMs: mockConfig.URL_EXPIRY_SEC * 1000,
  });

  rateLimiter = new RateLimiter(
    mockConfig.DOWNLOADS_PER_HR,
    3600,
    mockConfig.RATE_LIMIT_STORAGE_DIR,
  );

  indexer = new FileIndexer({ directory: tempDir, extensions: [".txt"] });
  await indexer.start();

  const deps: WebServerDependencies = {
    config: mockConfig,
    captchaManager,
    rateLimiter,
    indexer,
    log,
  };

  server = new WebServer(deps);
});

afterEach(async () => {
  await server.stop();
  indexer.stop();
  await rateLimiter.clear();
  await rm(tempDir, { recursive: true, force: true });
});

it("uploads file successfully to root directory", async () => {
  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
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

  const response = await server.getApp().inject({
    method: "POST",
    url: "/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.filename).toBe(fileName);
  expect(body.path).toBe(fileName);

  const uploadedFilePath = join(tempDir, fileName);
  await expect(access(uploadedFilePath)).resolves.toBeUndefined();
  const uploadedContent = await readFile(uploadedFilePath, "utf-8");
  expect(uploadedContent).toBe(fileContent);

  const files = indexer.getAll();
  const uploadedFile = files.find((f) => f.name === fileName);
  expect(uploadedFile).toBeDefined();
});

it("uploads file successfully to subdirectory", async () => {
  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
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

  const response = await server.getApp().inject({
    method: "POST",
    url: "/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.filename).toBe(fileName);
  expect(body.path).toBe(`${targetDir}/${fileName}`);

  const uploadedFilePath = join(tempDir, targetDir, fileName);
  await expect(access(uploadedFilePath)).resolves.toBeUndefined();
  const uploadedContent = await readFile(uploadedFilePath, "utf-8");
  expect(uploadedContent).toBe(fileContent);
});

it("returns 400 when no file is provided", async () => {
  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
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

  const response = await server.getApp().inject({
    method: "POST",
    url: "/upload",
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

  const response = await server.getApp().inject({
    method: "POST",
    url: "/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: "Missing authentication data" });
});

it("returns 403 when authentication token has expired", async () => {
  const userId = "user123";
  const expiredTimestamp = Date.now() - 1000;
  const manageUrl = server.generateManageUrl(userId);
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

  const response = await server.getApp().inject({
    method: "POST",
    url: "/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Authentication token has expired" });
});

it("returns 403 when signature is invalid", async () => {
  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
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

  const response = await server.getApp().inject({
    method: "POST",
    url: "/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Invalid authentication signature" });
});

it("sanitizes path and prevents directory traversal", async () => {
  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
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

  const response = await server.getApp().inject({
    method: "POST",
    url: "/upload",
    headers,
    payload,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);

  const sanitizedPath = "etc";
  expect(body.path).toBe(`${sanitizedPath}/${fileName}`);

  const uploadedFilePath = join(tempDir, sanitizedPath, fileName);
  await expect(access(uploadedFilePath)).resolves.toBeUndefined();

  const outsideTempDir = join(tempDir, "..", "..", "..", "etc", fileName);
  await expect(access(outsideTempDir)).rejects.toThrow();
});
