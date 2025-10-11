import { beforeEach, expect, it, vi } from "vitest";
import { deployCommands } from "./deployCommands.js";
import { logger } from "./logger.js";

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

it("deploys guild commands when guildId is provided", async () => {
  await deployCommands("test-token", "test-client-id", "test-guild-id", logger);

  expect(mockPut).toHaveBeenCalledWith(
    { clientId: "test-client-id", guildId: "test-guild-id", type: "guild" },
    expect.objectContaining({ body: expect.any(Array) }),
  );
});

it("deploys global commands when guildId is not provided", async () => {
  await deployCommands("test-token", "test-client-id", undefined, logger);

  expect(mockPut).toHaveBeenCalledWith(
    { clientId: "test-client-id", type: "global" },
    expect.objectContaining({ body: expect.any(Array) }),
  );
});

it("throws error when deployment fails", async () => {
  mockPut.mockRejectedValue(new Error("API error"));

  await expect(
    deployCommands("test-token", "test-client-id", "test-guild-id", logger),
  ).rejects.toThrow("API error");
});
