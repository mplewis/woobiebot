import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorOutbox, extractMessageContextStack } from "./errorOutbox.js";

const webhookUrl = "https://discord.com/api/webhooks/test";
let logger: pino.Logger;
let outbox: ErrorOutbox;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  logger = pino({ level: "silent" });
  outbox = new ErrorOutbox(webhookUrl, logger);
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
  });
  global.fetch = fetchMock;
});

afterEach(async () => {
  await outbox.stop();
  vi.clearAllMocks();
});

it("queues errors and sends them on flush", async () => {
  outbox.add("error", "Test error", { userId: "123" }, "stack trace");

  await outbox.flush();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    webhookUrl,
    expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  );

  const callBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
  expect(callBody.embeds).toHaveLength(1);
  expect(callBody.embeds[0]?.title).toContain("ERROR: Test error");
  expect(callBody.embeds[0].fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Context",
        value: expect.stringContaining("userId"),
      }),
      expect.objectContaining({
        name: "Stack Trace",
        value: expect.stringContaining("stack trace"),
      }),
    ]),
  );
});

it("deduplicates identical errors and increments count", async () => {
  outbox.add("error", "Same error", { key: "value" });
  outbox.add("error", "Same error", { key: "value" });
  outbox.add("error", "Same error", { key: "value" });

  await outbox.flush();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const callBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
  expect(callBody.embeds).toHaveLength(1);
  expect(callBody.embeds[0]?.title).toContain("(x3)");
});

it("treats different errors as separate entries", async () => {
  outbox.add("error", "Error 1");
  outbox.add("error", "Error 2");
  outbox.add("warn", "Error 1");

  await outbox.flush();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const callBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
  expect(callBody.embeds).toHaveLength(3);
});

it("treats errors with different context as separate entries", async () => {
  outbox.add("error", "Same message", { userId: "123" });
  outbox.add("error", "Same message", { userId: "456" });

  await outbox.flush();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const callBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
  expect(callBody.embeds).toHaveLength(2);
});

it("batches more than 10 errors into multiple requests", async () => {
  for (let i = 0; i < 15; i++) {
    outbox.add("error", `Error ${i}`);
  }

  await outbox.flush();

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const call1Body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
  const call2Body = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body ?? "{}");
  expect(call1Body.embeds).toHaveLength(10);
  expect(call2Body.embeds).toHaveLength(5);
});

it("clears entries after flush", async () => {
  outbox.add("error", "Test error");
  await outbox.flush();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockClear();

  await outbox.flush();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("handles webhook failures gracefully", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

  outbox.add("error", "Test error");

  await expect(outbox.flush()).resolves.not.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("retains failed entries in queue for retry", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

  outbox.add("error", "Failed error");

  await outbox.flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
  });

  await outbox.flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const callBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
  expect(callBody.embeds).toHaveLength(1);
  expect(callBody.embeds[0]?.title).toContain("Failed error");
});

it("removes only successful entries when some batches fail", async () => {
  for (let i = 0; i < 15; i++) {
    outbox.add("error", `Error ${i}`);
  }

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
  });
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

  await outbox.flush();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
  });

  await outbox.flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const callBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? "{}");
  expect(callBody.embeds).toHaveLength(5);
});

it("does nothing when flushing empty outbox", async () => {
  await outbox.flush();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("starts and stops periodic flushing", async () => {
  vi.useFakeTimers();

  outbox.start();
  outbox.add("error", "Test error");

  await vi.advanceTimersByTimeAsync(5000);

  expect(fetchMock).toHaveBeenCalledTimes(1);

  await outbox.stop();
  fetchMock.mockClear();

  outbox.add("error", "Another error");
  await vi.advanceTimersByTimeAsync(5000);

  expect(fetchMock).not.toHaveBeenCalled();

  vi.useRealTimers();
});

describe("extractMessageContextStack", () => {
  it("extracts message from args when obj has userId", () => {
    const result = extractMessageContextStack({ userId: "123" }, ["User not found"]);

    expect(result).toMatchInlineSnapshot(`
      {
        "context": {
          "userId": "123",
        },
        "message": "User not found",
      }
    `);
  });

  it("extracts message and stack from err object", () => {
    const error = new Error("Database connection failed");
    error.stack = "Error: Database connection failed\n    at test.ts:1:1";
    const result = extractMessageContextStack({ err: error }, []);

    expect(result).toMatchInlineSnapshot(`
      {
        "context": {
          "err": [Error: Database connection failed],
        },
        "message": "Database connection failed",
        "stack": "Error: Database connection failed
          at test.ts:1:1",
      }
    `);
  });

  it("extracts message from msg property", () => {
    const result = extractMessageContextStack({ msg: "Rate limit exceeded", userId: "456" }, []);

    expect(result).toMatchInlineSnapshot(`
      {
        "context": {
          "userId": "456",
        },
        "message": "Rate limit exceeded",
      }
    `);
  });

  it("extracts message from string", () => {
    const result = extractMessageContextStack("Simple error message", []);

    expect(result).toMatchInlineSnapshot(`
      {
        "message": "Simple error message",
      }
    `);
  });

  it("filters out Pino metadata from context", () => {
    const result = extractMessageContextStack(
      {
        msg: "Test error",
        level: 50,
        time: 1234567890,
        pid: 12345,
        hostname: "localhost",
        customField: "keep this",
      },
      [],
    );

    expect(result).toMatchInlineSnapshot(`
      {
        "context": {
          "customField": "keep this",
        },
        "message": "Test error",
      }
    `);
  });
});
