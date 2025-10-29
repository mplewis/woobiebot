import fs, { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rateLimiter.js";

let limiter: RateLimiter;
const testStorageDir = "tmp/test-rate-limit";

beforeEach(async () => {
  limiter = new RateLimiter(10, 3600, testStorageDir);
  await limiter.clear();
});

afterEach(async () => {
  await limiter.clear();
  try {
    await fs.rmdir(testStorageDir);
  } catch {
    // Ignore
  }
});

it("allows requests when under limit", async () => {
  const result = await limiter.consume("user1");

  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(9);
});

it("tracks remaining tokens correctly", async () => {
  await limiter.consume("user1");
  await limiter.consume("user1");
  const result = await limiter.consume("user1");

  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(7);
});

it("blocks requests when limit exceeded", async () => {
  for (let i = 0; i < 10; i++) {
    await limiter.consume("user1");
  }
  const result = await limiter.consume("user1");

  expect(result.allowed).toBe(false);
  expect(result.remainingTokens).toBe(0);
});

it("tracks different users separately", async () => {
  for (let i = 0; i < 10; i++) {
    await limiter.consume("user1");
  }
  const result = await limiter.consume("user2");

  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(9);
});

it("refills tokens over time", async () => {
  limiter = new RateLimiter(10, 1, testStorageDir);

  for (let i = 0; i < 10; i++) {
    await limiter.consume("user1", new Date(0));
  }

  let result = await limiter.consume("user1", new Date(0));
  expect(result.allowed).toBe(false);

  result = await limiter.consume("user1", new Date(150));
  expect(result.allowed).toBe(true);
});

it("caps tokens at maximum", async () => {
  limiter = new RateLimiter(5, 1, testStorageDir);

  await limiter.consume("user1", new Date(0));

  const state = await limiter.getState("user1", new Date(2000));
  expect(state.remainingTokens).toBe(5);
});

it("gets state without consuming tokens", async () => {
  await limiter.consume("user1");
  const state1 = await limiter.getState("user1");
  const state2 = await limiter.getState("user1");

  expect(state1.remainingTokens).toBe(state2.remainingTokens);
  expect(state1.remainingTokens).toBe(9);
});

it("clears all user data", async () => {
  await limiter.consume("user1");
  await limiter.consume("user2");

  await limiter.clear();

  const state = await limiter.getState("user1");
  expect(state.remainingTokens).toBe(10);
});

it("provides reset timestamp", async () => {
  const result = await limiter.consume("user1", new Date(0));

  expect(result.resetAt.getTime()).toBe(3600 * 1000);
});

it("integration: shows token refill at 1 token/sec with successes and failures", async () => {
  limiter = new RateLimiter(3, 3, testStorageDir);

  // t=0: Start with 3 tokens, consume 3
  let result = await limiter.consume("user1", new Date(0));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(2);

  result = await limiter.consume("user1", new Date(0));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(1);

  result = await limiter.consume("user1", new Date(0));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(0);

  // t=0: Out of tokens, should fail
  result = await limiter.consume("user1", new Date(0));
  expect(result.allowed).toBe(false);
  expect(result.remainingTokens).toBe(0);

  // t=0.5s: Only 0.5 tokens refilled, still not enough
  result = await limiter.consume("user1", new Date(500));
  expect(result.allowed).toBe(false);
  expect(result.remainingTokens).toBe(0);

  // t=1s: 1 token refilled, should succeed
  result = await limiter.consume("user1", new Date(1000));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(0);

  // t=1s: Immediately after, should fail
  result = await limiter.consume("user1", new Date(1000));
  expect(result.allowed).toBe(false);
  expect(result.remainingTokens).toBe(0);

  // t=2.5s: 1.5 tokens refilled, should succeed (consuming 1)
  result = await limiter.consume("user1", new Date(2500));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(0);

  // t=2.5s: Immediately after, should fail
  result = await limiter.consume("user1", new Date(2500));
  expect(result.allowed).toBe(false);
  expect(result.remainingTokens).toBe(0);

  // t=5s: 2.5 tokens refilled since t=2.5s, should succeed
  result = await limiter.consume("user1", new Date(5000));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(2);

  // t=5s: Still have 2 tokens, should succeed
  result = await limiter.consume("user1", new Date(5000));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(1);

  // t=5s: Still have 1 token, should succeed
  result = await limiter.consume("user1", new Date(5000));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(0);

  // t=5s: Now out of tokens, should fail
  result = await limiter.consume("user1", new Date(5000));
  expect(result.allowed).toBe(false);
  expect(result.remainingTokens).toBe(0);

  // t=10s: Fully refilled to 3 tokens cap, consume 2
  result = await limiter.consume("user1", new Date(10000));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(2);

  result = await limiter.consume("user1", new Date(10000));
  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(1);
});

it("persists rate limit data to disk", async () => {
  const now = new Date(0);
  await limiter.consume("user1", now);
  await limiter.consume("user1", now);
  await limiter.consume("user1", now);

  const filePath = path.join(testStorageDir, "user1.json");
  const fileContent = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(fileContent);

  expect(data.userId).toBe("user1");
  expect(data.tokens).toBe(7);
  expect(data.lastRefill).toBe(0);
});

it("loads rate limit data from disk on new instance", async () => {
  await limiter.consume("user1");
  await limiter.consume("user1");
  await limiter.consume("user1");

  const limiter2 = new RateLimiter(10, 3600, testStorageDir);
  const state = await limiter2.getState("user1");

  expect(state.remainingTokens).toBe(7);
});

it("handles corrupt data by treating as empty", async () => {
  await fs.mkdir(testStorageDir, { recursive: true });
  const filePath = path.join(testStorageDir, "user1.json");
  await fs.writeFile(filePath, "invalid json{", "utf-8");

  const result = await limiter.consume("user1");

  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(9);
});

it("handles invalid schema by treating as empty", async () => {
  await fs.mkdir(testStorageDir, { recursive: true });
  const filePath = path.join(testStorageDir, "user1.json");
  await fs.writeFile(filePath, JSON.stringify({ invalid: "data" }), "utf-8");

  const result = await limiter.consume("user1");

  expect(result.allowed).toBe(true);
  expect(result.remainingTokens).toBe(9);
});

it("clears files on disk when clearing", async () => {
  await limiter.consume("user1");
  await limiter.consume("user2");

  const file1Path = path.join(testStorageDir, "user1.json");
  const file2Path = path.join(testStorageDir, "user2.json");

  expect(
    await fs.access(file1Path).then(
      () => true,
      () => false,
    ),
  ).toBe(true);
  expect(
    await fs.access(file2Path).then(
      () => true,
      () => false,
    ),
  ).toBe(true);

  await limiter.clear();

  expect(
    await fs.access(file1Path).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  expect(
    await fs.access(file2Path).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

describe("error handling", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "rate-limiter-errors-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("handles writeFile errors gracefully", async () => {
    const limiter = new RateLimiter(10, 3600, testDir);

    vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("Write error"));

    const result = await limiter.consume("user1");

    expect(result.allowed).toBe(true);

    vi.restoreAllMocks();
  });

  it("handles readFile errors gracefully", async () => {
    const limiter = new RateLimiter(10, 3600, testDir);

    const errorWithCode = new Error("Read error") as NodeJS.ErrnoException;
    errorWithCode.code = "EACCES";
    vi.spyOn(fs, "readFile").mockRejectedValue(errorWithCode);

    const result = await limiter.consume("user1");

    expect(result.allowed).toBe(true);

    vi.restoreAllMocks();
  });

  it("handles clear errors when directory does not exist", async () => {
    const limiter = new RateLimiter(10, 3600, `${testDir}/nonexistent`);

    await expect(limiter.clear()).resolves.not.toThrow();
  });

  it("handles clear errors when readdir fails", async () => {
    const limiter = new RateLimiter(10, 3600, testDir);

    const errorWithCode = new Error("Readdir error") as NodeJS.ErrnoException;
    errorWithCode.code = "EACCES";
    vi.spyOn(fs, "readdir").mockRejectedValue(errorWithCode);

    await expect(limiter.clear()).resolves.not.toThrow();

    vi.restoreAllMocks();
  });
});
