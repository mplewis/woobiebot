import { beforeEach, expect, it, vi } from "vitest";
import { deployCommands } from "./deployCommands.js";
import { log } from "./logger.js";

const mockPut = vi.fn();

vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  return {
    ...actual,
    REST: vi.fn(() => ({
      setToken: vi.fn(() => ({
        put: mockPut,
      })),
    })),
    Routes: {
      applicationGuildCommands: vi.fn((clientId: string, guildId: string) => ({
        clientId,
        guildId,
        type: "guild",
      })),
      applicationCommands: vi.fn((clientId: string) => ({ clientId, type: "global" })),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPut.mockResolvedValue(undefined);
});

it("deploys global commands and guild commands when guild IDs provided", async () => {
  await deployCommands("test-token", "test-client-id", ["guild-1", "guild-2"], log);

  expect(mockPut).toHaveBeenCalledTimes(3);
  expect(mockPut).toHaveBeenNthCalledWith(
    1,
    { clientId: "test-client-id", type: "global" },
    expect.objectContaining({ body: expect.any(Array) }),
  );
  expect(mockPut).toHaveBeenNthCalledWith(
    2,
    { clientId: "test-client-id", guildId: "guild-1", type: "guild" },
    expect.objectContaining({ body: expect.any(Array) }),
  );
  expect(mockPut).toHaveBeenNthCalledWith(
    3,
    { clientId: "test-client-id", guildId: "guild-2", type: "guild" },
    expect.objectContaining({ body: expect.any(Array) }),
  );
});

it("deploys only global commands when no guild IDs provided", async () => {
  await deployCommands("test-token", "test-client-id", [], log);

  expect(mockPut).toHaveBeenCalledTimes(1);
  expect(mockPut).toHaveBeenCalledWith(
    { clientId: "test-client-id", type: "global" },
    expect.objectContaining({ body: expect.any(Array) }),
  );
});

it("throws error when deployment fails", async () => {
  mockPut.mockRejectedValue(new Error("API error"));

  await expect(deployCommands("test-token", "test-client-id", [], log)).rejects.toThrow(
    "API error",
  );
});
