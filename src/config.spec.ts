import { afterEach, beforeEach, expect, it, vi } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

it("loads valid configuration", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.DISCORD_TOKEN).toBe("test_token");
  expect(config.DISCORD_CLIENT_ID).toBe("test_client_id");
  expect(config.FILES_DIRECTORY).toBe("./files");
  expect(config.CAPTCHA_PORT).toBe(3000);
});

it("throws error when required fields are missing", async () => {
  process.env = {};

  await expect(async () => {
    const { loadConfig } = await import("./config.js");
    loadConfig();
  }).rejects.toThrow("Configuration validation failed");
});

it("uses custom values when provided", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["CAPTCHA_PORT"] = "5000";
  process.env["RATE_LIMIT_DOWNLOADS"] = "20";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.CAPTCHA_PORT).toBe(5000);
  expect(config.RATE_LIMIT_DOWNLOADS).toBe(20);
});
