import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CaptchaManager } from "../captcha.js";
import type { Config } from "../config.js";
import { FileIndexer } from "../indexer.js";
import { log } from "../logger.js";
import { RateLimiter } from "../rateLimiter.js";
import { WebServer, type WebServerDependencies } from "../webServer.js";

/**
 * Web server instance for testing delete operations.
 */
let server: WebServer;

/**
 * Temporary directory path for test files.
 */
let tempDir: string;

/**
 * File indexer instance for tracking test files.
 */
let indexer: FileIndexer;

/**
 * Captcha manager instance for authentication.
 */
let captchaManager: CaptchaManager;

/**
 * Rate limiter instance for request throttling.
 */
let rateLimiter: RateLimiter;

/**
 * Mock configuration for test environment.
 */
let mockConfig: Config;

/**
 * Set up test environment before each test.
 */
beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "delete-test-"));

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
    RATE_LIMIT_STORAGE_DIR: "tmp/test-rate-limit-delete",
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

/**
 * Clean up test environment after each test.
 */
afterEach(async () => {
  await server.stop();
  indexer.stop();
  await rateLimiter.clear();
  await rm(tempDir, { recursive: true, force: true });
});

it("deletes file successfully", async () => {
  const fileName = "test-delete.txt";
  const fileContent = "File to be deleted";
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, fileContent);
  await indexer.rescan();

  const files = indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.success).toBe(true);
  expect(body.message).toBe("File deleted successfully");

  await expect(access(filePath)).rejects.toThrow();

  const hiddenFilePath = join(tempDir, `.${fileName}`);
  await expect(access(hiddenFilePath)).resolves.toBeUndefined();

  const filesAfterDelete = indexer.getAll();
  const deletedFile = filesAfterDelete.find((f) => f.name === fileName);
  expect(deletedFile).toBeUndefined();
});

it("returns 400 when authentication parameters are missing", async () => {
  const fileName = "test-file.txt";
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, "content");
  await indexer.rescan();

  const files = indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const response = await server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}`,
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: "Missing authentication parameters" });
});

it("returns 400 when expiration timestamp is invalid", async () => {
  const fileName = "test-file.txt";
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, "content");
  await indexer.rescan();

  const files = indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  if (!signature) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=not-a-number`,
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: "Invalid expiration timestamp" });
});

it("returns 403 when authentication token has expired", async () => {
  const fileName = "test-file.txt";
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, "content");
  await indexer.rescan();

  const files = indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const expiredTimestamp = Date.now() - 1000;
  const manageUrl = server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");

  if (!signature) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=${expiredTimestamp}`,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Authentication token has expired" });
});

it("returns 403 when signature is invalid", async () => {
  const fileName = "test-file.txt";
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, "content");
  await indexer.rescan();

  const files = indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=invalid-signature&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Invalid authentication signature" });
});

it("returns 404 when file not found in index", async () => {
  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const nonExistentFileId = "nonexistent-file-id";

  const response = await server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${nonExistentFileId}?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: "File not found" });
});

it("returns 500 when file in index but not on disk", async () => {
  const fileName = "test-file.txt";
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, "content");
  await indexer.rescan();

  const files = indexer.getAll();
  const file = files.find((f) => f.name === fileName);
  if (!file) {
    throw new Error("Test file not found in indexer");
  }

  await rm(filePath);

  const userId = "user123";
  const manageUrl = server.generateManageUrl(userId);
  const urlObj = new URL(manageUrl);
  const signature = urlObj.searchParams.get("signature");
  const expiresAt = urlObj.searchParams.get("expiresAt");

  if (!signature || !expiresAt) {
    throw new Error("Failed to generate manage URL");
  }

  const response = await server.getApp().inject({
    method: "DELETE",
    url: `/manage/delete/${file.id}?userId=${userId}&signature=${signature}&expiresAt=${expiresAt}`,
  });

  expect(response.statusCode).toBe(500);
  expect(response.json()).toEqual({ error: "File temporarily unavailable" });
});
