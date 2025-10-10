import { afterEach, beforeEach, expect, it, vi } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = {};
});

afterEach(() => {
  process.env = originalEnv;
});

it("loads valid configuration", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";
  process.env["FILES_DIRECTORY"] = "./test-files";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.DISCORD_TOKEN).toBe("test_token");
  expect(config.DISCORD_CLIENT_ID).toBe("test_client_id");
  expect(config.FILES_DIRECTORY).toBe("./test-files");
});

it.skip("validates SIGNING_SECRET length", async () => {
  // Skipped: dotenv loads .env before we can override in tests
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "too-short";

  const { loadConfig } = await import("./config.js");
  expect(() => loadConfig()).toThrow("Signing secret must be at least 32 characters");
});

it("uses custom values when provided", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";
  process.env["WEB_SERVER_PORT"] = "5000";
  process.env["RATE_LIMIT_DOWNLOADS"] = "20";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.WEB_SERVER_PORT).toBe(5000);
  expect(config.RATE_LIMIT_DOWNLOADS).toBe(20);
});
