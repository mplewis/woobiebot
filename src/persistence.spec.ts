import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { RateLimitPersistence } from "./persistence.js";
import type { UserRateLimit } from "./rateLimiter.js";

const TEST_DIR = join(process.cwd(), "tmp", "test-persistence");
const TEST_FILE = join(TEST_DIR, "rate-limits.json");

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

it("saves state to disk", async () => {
  const persistence = new RateLimitPersistence(TEST_FILE);
  const states: UserRateLimit[] = [
    { userId: "user1", tokens: 5, lastRefill: Date.now() },
    { userId: "user2", tokens: 8, lastRefill: Date.now() },
  ];

  await persistence.save(states);
  const loaded = await persistence.load();

  expect(loaded).toHaveLength(2);
  expect(loaded[0]?.userId).toBe("user1");
  expect(loaded[1]?.userId).toBe("user2");
});

it("loads state from disk", async () => {
  const persistence = new RateLimitPersistence(TEST_FILE);
  const states: UserRateLimit[] = [{ userId: "user1", tokens: 3.5, lastRefill: 1234567890 }];

  await persistence.save(states);
  const loaded = await persistence.load();

  expect(loaded).toHaveLength(1);
  const user = loaded[0];
  if (!user) {
    throw new Error("User not found");
  }
  expect(user.userId).toBe("user1");
  expect(user.tokens).toBe(3.5);
  expect(user.lastRefill).toBe(1234567890);
});

it("returns empty array when file does not exist", async () => {
  const persistence = new RateLimitPersistence(TEST_FILE);
  const loaded = await persistence.load();

  expect(loaded).toEqual([]);
});

it("overwrites existing file", async () => {
  const persistence = new RateLimitPersistence(TEST_FILE);
  const states1: UserRateLimit[] = [{ userId: "user1", tokens: 5, lastRefill: Date.now() }];
  const states2: UserRateLimit[] = [
    { userId: "user2", tokens: 3, lastRefill: Date.now() },
    { userId: "user3", tokens: 7, lastRefill: Date.now() },
  ];

  await persistence.save(states1);
  await persistence.save(states2);
  const loaded = await persistence.load();

  expect(loaded).toHaveLength(2);
  expect(loaded[0]?.userId).toBe("user2");
  expect(loaded[1]?.userId).toBe("user3");
});
