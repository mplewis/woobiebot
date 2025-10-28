import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CaptchaManager } from "./captcha.js";
import type { Config } from "./config.js";
import { FileIndexer } from "./indexer.js";
import { log } from "./logger.js";
import { RateLimiter } from "./rateLimiter.js";
import { solveCaptcha } from "./testUtils.js";
import { WebServer, type WebServerDependencies } from "./webServer.js";

let server: WebServer;
let tempDir: string;
let indexer: FileIndexer;
let captchaManager: CaptchaManager;
let rateLimiter: RateLimiter;
let mockConfig: Config;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "webserver-test-"));
  await writeFile(join(tempDir, "test.txt"), "Hello, World!");

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
    CAPTCHA_CHALLENGE_COUNT: 50,
    CAPTCHA_DIFFICULTY: 4,
    DOWNLOADS_PER_HR: 10,
    RATE_LIMIT_STORAGE_DIR: "tmp/test-rate-limit-webserver",
    SEARCH_MIN_CHARS: 3,
    SEARCH_THRESHOLD: 0.6,
    SCAN_INTERVAL_MINS: 15,
    LOG_LEVEL: "error",
    NODE_ENV: "test",
    DISCORD_LOGGING_LEVEL: "error" as const,
    DISCORD_LOGGING_TAGS: new Map(),
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

it("generates a valid signed URL", () => {
  const url = server.generateDownloadUrl("user123", "file456");

  expect(url).toContain(mockConfig.WEB_SERVER_BASE_URL);
  expect(url).toContain("/download");
  expect(url).toContain("userId=user123");
  expect(url).toContain("fileId=file456");
  expect(url).toContain("signature=");
  expect(url).toContain("expiresAt=");
});

it("returns captcha page for valid signed URL", async () => {
  const files = indexer.getAll();
  const fileId = files[0]?.id;
  if (!fileId) {
    throw new Error("No files in indexer");
  }

  const url = server.generateDownloadUrl("user123", fileId);
  const urlObj = new URL(url);
  const path = `${urlObj.pathname}${urlObj.search}`;

  const response = await server.getApp().inject({
    method: "GET",
    url: path,
  });

  expect(response.statusCode).toBe(200);
  expect(response.headers["content-type"]).toContain("text/html");
  expect(response.body).toContain("Just a moment...");
});

it("returns 403 for invalid signature", async () => {
  const response = await server.getApp().inject({
    method: "GET",
    url: "/download?userId=user123&fileId=file456&expiresAt=999999999999&signature=invalid",
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({
    error: "Invalid or expired download link",
  });
});

it("returns 404 for non-existent file", async () => {
  const url = server.generateDownloadUrl("user123", "nonexistent");
  const urlObj = new URL(url);
  const path = `${urlObj.pathname}${urlObj.search}`;

  const response = await server.getApp().inject({
    method: "GET",
    url: path,
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: "File not found" });
});

it("returns 403 for expired URL", async () => {
  const files = indexer.getAll();
  const fileId = files[0]?.id;
  if (!fileId) {
    throw new Error("No files in indexer");
  }

  vi.useFakeTimers();
  const url = server.generateDownloadUrl("user123", fileId);

  // Fast forward past expiration
  vi.advanceTimersByTime(mockConfig.URL_EXPIRY_SEC * 1000 + 1000);

  const urlObj = new URL(url);
  const path = `${urlObj.pathname}${urlObj.search}`;

  const response = await server.getApp().inject({
    method: "GET",
    url: path,
  });

  expect(response.statusCode).toBe(403);

  vi.useRealTimers();
});

it("downloads file with valid captcha solution", async () => {
  const files = indexer.getAll();
  const fileId = files[0]?.id;
  if (!fileId) {
    throw new Error("No files in indexer");
  }

  const userId = "user123";
  const challengeData = await captchaManager.generateChallenge(userId, fileId);

  // Solve the captcha
  const solution = solveCaptcha(challengeData.token, challengeData.challenge);

  const response = await server.getApp().inject({
    method: "POST",
    url: "/verify",
    payload: {
      userId,
      fileId,
      token: challengeData.token,
      challenge: JSON.stringify(challengeData.challenge),
      signature: challengeData.signature,
      solution: solution.join(","),
    },
  });

  expect(response.statusCode).toBe(200);
  expect(response.headers["content-type"]).toContain("text/plain");
  expect(response.headers["content-disposition"]).toContain("test.txt");
  expect(response.body).toBe("Hello, World!");
});

it("sanitizes filenames with special characters in Content-Disposition header", async () => {
  const specialFilename = 'test"file\nwith\rspecial\\chars.txt';
  await writeFile(join(tempDir, specialFilename), "Special content");

  await indexer.stop();
  const newIndexer = new FileIndexer({ directory: tempDir, extensions: [".txt"] });
  await newIndexer.start();

  const files = newIndexer.getAll();
  const specialFile = files.find((f) => f.name === specialFilename);
  if (!specialFile) {
    throw new Error("Special filename file not found in indexer");
  }

  await server.stop();
  server = new WebServer({
    config: mockConfig,
    captchaManager,
    rateLimiter,
    indexer: newIndexer,
    log,
  });

  const userId = "user123";
  const challengeData = await captchaManager.generateChallenge(userId, specialFile.id);
  const solution = solveCaptcha(challengeData.token, challengeData.challenge);

  const response = await server.getApp().inject({
    method: "POST",
    url: "/verify",
    payload: {
      userId,
      fileId: specialFile.id,
      token: challengeData.token,
      challenge: JSON.stringify(challengeData.challenge),
      signature: challengeData.signature,
      solution: solution.join(","),
    },
  });

  expect(response.statusCode).toBe(200);

  const disposition = response.headers["content-disposition"];
  expect(disposition).toBeDefined();
  expect(disposition).toContain("attachment");
  expect(disposition).toContain('filename="test\\"filewithspecial\\\\chars.txt"');
  expect(disposition).toContain("filename*=UTF-8''test%22file%0Awith%0Dspecial%5Cchars.txt");
  expect(response.body).toBe("Special content");

  indexer = newIndexer;
});

it("returns 400 for missing fields", async () => {
  const response = await server.getApp().inject({
    method: "POST",
    url: "/verify",
    payload: {
      userId: "user123",
    },
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({ error: "Missing required fields" });
});

it("returns 403 for invalid captcha solution", async () => {
  const files = indexer.getAll();
  const fileId = files[0]?.id;
  if (!fileId) {
    throw new Error("No files in indexer");
  }

  const userId = "user123";
  const challengeData = await captchaManager.generateChallenge(userId, fileId);

  const response = await server.getApp().inject({
    method: "POST",
    url: "/verify",
    payload: {
      userId,
      fileId,
      token: challengeData.token,
      challenge: JSON.stringify(challengeData.challenge),
      signature: challengeData.signature,
      solution: "0,0,0",
    },
  });

  expect(response.statusCode).toBe(403);
  expect(response.json()).toEqual({ error: "Invalid captcha solution" });
});

it("returns 429 when rate limit exceeded", async () => {
  const files = indexer.getAll();
  const fileId = files[0]?.id;
  if (!fileId) {
    throw new Error("No files in indexer");
  }

  const userId = "user123";

  // Exhaust rate limit
  for (let i = 0; i < mockConfig.DOWNLOADS_PER_HR; i++) {
    await rateLimiter.consume(userId);
  }

  const challengeData = await captchaManager.generateChallenge(userId, fileId);
  const solution = solveCaptcha(challengeData.token, challengeData.challenge);

  const response = await server.getApp().inject({
    method: "POST",
    url: "/verify",
    payload: {
      userId,
      fileId,
      token: challengeData.token,
      challenge: JSON.stringify(challengeData.challenge),
      signature: challengeData.signature,
      solution: solution.join(","),
    },
  });

  expect(response.statusCode).toBe(429);
  expect(response.json()).toEqual({
    error: "Rate limit exceeded. Please try again later.",
  });
});

it("returns 404 for non-existent file", async () => {
  const userId = "user123";
  const fileId = "nonexistent";
  const challengeData = await captchaManager.generateChallenge(userId, fileId);
  const solution = solveCaptcha(challengeData.token, challengeData.challenge);

  const response = await server.getApp().inject({
    method: "POST",
    url: "/verify",
    payload: {
      userId,
      fileId,
      token: challengeData.token,
      challenge: JSON.stringify(challengeData.challenge),
      signature: challengeData.signature,
      solution: solution.join(","),
    },
  });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: "File not found" });
});

it("returns health status", async () => {
  const response = await server.getApp().inject({
    method: "GET",
    url: "/health",
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  expect(body.status).toBe("ok");
  expect(body.timestamp).toBeTypeOf("number");
});

it("starts and stops server successfully", async () => {
  const testServer = new WebServer({
    config: { ...mockConfig, WEB_SERVER_PORT: 3002 },
    captchaManager,
    rateLimiter,
    indexer,
    log,
  });

  await expect(testServer.start()).resolves.toBeUndefined();
  await expect(testServer.stop()).resolves.toBeUndefined();
});

it("returns generic error message for 500 errors without exposing details", async () => {
  const mockIndexer = {
    ...indexer,
    getById: vi.fn().mockImplementation(() => {
      throw new Error("Database connection failed with credentials: secret123");
    }),
  };

  const testServer = new WebServer({
    config: mockConfig,
    captchaManager,
    rateLimiter,
    indexer: mockIndexer as unknown as FileIndexer,
    log,
  });

  const userId = "user123";
  const fileId = "test-file";
  const challengeData = await captchaManager.generateChallenge(userId, fileId);
  const solution = solveCaptcha(challengeData.token, challengeData.challenge);

  const response = await testServer.getApp().inject({
    method: "POST",
    url: "/verify",
    payload: {
      userId,
      fileId,
      token: challengeData.token,
      challenge: JSON.stringify(challengeData.challenge),
      signature: challengeData.signature,
      solution: solution.join(","),
    },
  });

  expect(response.statusCode).toBe(500);
  expect(response.json()).toEqual({ error: "Internal server error" });
  expect(response.body).not.toContain("secret123");
  expect(response.body).not.toContain("Database connection failed");
});
