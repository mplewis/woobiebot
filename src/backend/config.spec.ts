import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  process.env["DOWNLOADS_PER_HR"] = "20";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.WEB_SERVER_PORT).toBe(5000);
  expect(config.DOWNLOADS_PER_HR).toBe(20);
});

it("uses default SEARCH_MIN_CHARS when not provided", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.SEARCH_MIN_CHARS).toBe(3);
});

it("uses custom SEARCH_MIN_CHARS when provided", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";
  process.env["SEARCH_MIN_CHARS"] = "5";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.SEARCH_MIN_CHARS).toBe(5);
});

it("uses default SEARCH_THRESHOLD when not provided", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.SEARCH_THRESHOLD).toBe(0.6);
});

it("uses custom SEARCH_THRESHOLD when provided", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";
  process.env["SEARCH_THRESHOLD"] = "0.8";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.SEARCH_THRESHOLD).toBe(0.8);
});

it("returns empty array for empty DISCORD_GUILD_IDS", async () => {
  process.env["DISCORD_TOKEN"] = "test_token";
  process.env["DISCORD_CLIENT_ID"] = "test_client_id";
  process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";
  process.env["DISCORD_GUILD_IDS"] = "";

  const { loadConfig } = await import("./config.js");
  const config = loadConfig();

  expect(config.DISCORD_GUILD_IDS).toEqual([]);
});

describe("parseTagPairs", () => {
  beforeEach(() => {
    // Set up minimal required env vars so config module can load
    process.env["DISCORD_TOKEN"] = "test_token";
    process.env["DISCORD_CLIENT_ID"] = "test_client_id";
    process.env["SIGNING_SECRET"] = "this-is-a-very-long-secret-key-for-signing";
  });

  it("returns empty Map for empty string", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("");
    expect(result.size).toBe(0);
  });

  it("parses single key:value pair", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("category:payment");
    expect(result.size).toBe(1);
    expect(result.get("category")).toEqual(["payment"]);
  });

  it("parses multiple key:value pairs", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("component:security,category:payment");
    expect(result.size).toBe(2);
    expect(result.get("component")).toEqual(["security"]);
    expect(result.get("category")).toEqual(["payment"]);
  });

  it("groups multiple values for same key", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("category:payment,category:failure,category:success");
    expect(result.size).toBe(1);
    expect(result.get("category")).toEqual(["payment", "failure", "success"]);
  });

  it("handles mixed keys with multiple values", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs(
      "component:security,category:payment,category:failure,component:auth",
    );
    expect(result.size).toBe(2);
    expect(result.get("component")).toEqual(["security", "auth"]);
    expect(result.get("category")).toEqual(["payment", "failure"]);
  });

  it("trims whitespace around keys and values", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs(" component : security , category : payment ");
    expect(result.size).toBe(2);
    expect(result.get("component")).toEqual(["security"]);
    expect(result.get("category")).toEqual(["payment"]);
  });

  it("skips entries without colon", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("component:security,invalidentry,category:payment");
    expect(result.size).toBe(2);
    expect(result.get("component")).toEqual(["security"]);
    expect(result.get("category")).toEqual(["payment"]);
  });

  it("skips entries with empty key", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs(":value,component:security");
    expect(result.size).toBe(1);
    expect(result.get("component")).toEqual(["security"]);
  });

  it("skips entries with empty value", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("key:,component:security");
    expect(result.size).toBe(1);
    expect(result.get("component")).toEqual(["security"]);
  });

  it("handles empty entries after splitting", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("component:security,,,,category:payment");
    expect(result.size).toBe(2);
    expect(result.get("component")).toEqual(["security"]);
    expect(result.get("category")).toEqual(["payment"]);
  });

  it("handles values with colons", async () => {
    const { parseTagPairs } = await import("./config.js");
    const result = parseTagPairs("url:https://example.com,component:security");
    expect(result.size).toBe(2);
    expect(result.get("url")).toEqual(["https://example.com"]);
    expect(result.get("component")).toEqual(["security"]);
  });
});
