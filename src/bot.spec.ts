import { GatewayIntentBits } from "discord.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bot } from "./bot.js";
import { CaptchaManager } from "./captcha.js";
import type { Config } from "./config.js";
import { FileIndexer } from "./indexer.js";
import { log } from "./logger.js";
import { RateLimiter } from "./rateLimiter.js";
import { WebServer } from "./webServer.js";

let bot: Bot;
let indexer: FileIndexer;
let rateLimiter: RateLimiter;
let webServer: WebServer;
let config: Config;

beforeEach(() => {
  config = {
    DISCORD_TOKEN: "test-token",
    DISCORD_CLIENT_ID: "test-client-id",
    DISCORD_GUILD_IDS: [],
    FILES_DIRECTORY: "./test-files",
    FILE_EXTENSIONS: [".txt"],
    WEB_SERVER_PORT: 3000,
    WEB_SERVER_HOST: "127.0.0.1",
    WEB_SERVER_BASE_URL: "http://localhost:3000",
    SIGNING_SECRET: "test-secret-must-be-at-least-32-chars-long",
    URL_EXPIRY_SEC: 600,
    MANAGE_URL_EXPIRY_SEC: 3600,
    CAPTCHA_CHALLENGE_COUNT: 3,
    CAPTCHA_DIFFICULTY: 2,
    DOWNLOADS_PER_HR: 10,
    RATE_LIMIT_STORAGE_DIR: "tmp/test-rate-limit-bot",
    SEARCH_MIN_CHARS: 3,
    SEARCH_THRESHOLD: 0.6,
    SCAN_INTERVAL_MINS: 15,
    LOG_LEVEL: "fatal" as const,
    NODE_ENV: "test" as const,
  };

  indexer = new FileIndexer({
    directory: config.FILES_DIRECTORY,
    extensions: config.FILE_EXTENSIONS,
    threshold: config.SEARCH_THRESHOLD,
  });

  rateLimiter = new RateLimiter(config.DOWNLOADS_PER_HR, 3600, config.RATE_LIMIT_STORAGE_DIR);

  const captchaManager = new CaptchaManager({
    hmacSecret: config.SIGNING_SECRET,
    challengeCount: config.CAPTCHA_CHALLENGE_COUNT,
    challengeDifficulty: config.CAPTCHA_DIFFICULTY,
    expiresMs: config.URL_EXPIRY_SEC * 1000,
  });

  webServer = new WebServer({
    config,
    captchaManager,
    rateLimiter,
    indexer,
    log,
  });

  bot = new Bot({
    config,
    indexer,
    rateLimiter,
    webServer,
    log,
  });
});

afterEach(async () => {
  await webServer.stop();
  indexer.stop();
  await rateLimiter.clear();
});

it("creates bot instance", () => {
  expect(bot).toBeDefined();
  expect(bot.getClient()).toBeDefined();
});

it("bot client has only Guilds intent", () => {
  const client = bot.getClient();
  const intents = client.options.intents;
  expect(intents).toBeDefined();
  expect(intents?.bitfield).toBe(GatewayIntentBits.Guilds);
});

describe("search interaction", () => {
  /**
   * Mock Discord interaction object for testing search commands
   */
  type MockInteraction = {
    commandName: string;
    user: { id: string };
    options: {
      getString: (name: string) => string | null;
    };
    deferReply: () => Promise<void>;
    editReply: (options: { content: string }) => Promise<{ content: string }>;
  };

  /**
   * Creates a mock Discord interaction with a search query and reply capture
   */
  const createMockInteraction = (
    query: string,
  ): MockInteraction & { getCapturedReply: () => string } => {
    let capturedReply = "";
    return {
      commandName: "search",
      user: { id: "test-user-123" },
      options: {
        getString: (name: string) => {
          if (name === "query") {
            return query;
          }
          return null;
        },
      },
      deferReply: async () => {
        /* intentionally empty */
      },
      editReply: async (options: { content: string }) => {
        capturedReply = options.content;
        return options;
      },
      getCapturedReply: () => capturedReply,
    };
  };

  /**
   * Invokes the bot's handleCommand method with a mock interaction
   */
  const callHandleCommand = async (botInstance: Bot, mockInteraction: MockInteraction) => {
    const handleCommand = (
      botInstance as unknown as { handleCommand: (interaction: unknown) => Promise<void> }
    ).handleCommand;
    await handleCommand.call(botInstance, mockInteraction);
  };

  beforeEach(async () => {
    await indexer.start();
  });

  it("rejects search queries shorter than SEARCH_MIN_CHARS", async () => {
    const mockInteraction = createMockInteraction("ab");
    await callHandleCommand(bot, mockInteraction);
    expect(mockInteraction.getCapturedReply()).toBe("Search query must be at least 3 characters.");
  });

  it("shows singular 'character' when SEARCH_MIN_CHARS is 1", async () => {
    config.SEARCH_MIN_CHARS = 1;
    const botWithMinOne = new Bot({
      config,
      indexer,
      rateLimiter,
      webServer,
      log,
    });

    const mockInteraction = createMockInteraction("");
    await callHandleCommand(botWithMinOne, mockInteraction);
    expect(mockInteraction.getCapturedReply()).toBe("Search query must be at least 1 character.");
  });
});

describe("manage interaction", () => {
  /**
   * Mock Discord interaction object for testing manage commands
   */
  type MockInteraction = {
    commandName: string;
    user: { id: string };
    options: {
      getString: (name: string) => string | null;
    };
    deferReply: () => Promise<void>;
    editReply: (options: { content: string }) => Promise<{ content: string }>;
  };

  /**
   * Creates a mock Discord interaction for the manage command
   */
  const createMockInteraction = (): MockInteraction & { getCapturedReply: () => string } => {
    let capturedReply = "";
    return {
      commandName: "manage",
      user: { id: "test-user-123" },
      options: {
        getString: () => null,
      },
      deferReply: async () => {
        /* intentionally empty */
      },
      editReply: async (options: { content: string }) => {
        capturedReply = options.content;
        return options;
      },
      getCapturedReply: () => capturedReply,
    };
  };

  /**
   * Invokes the bot's handleCommand method with a mock interaction
   */
  const callHandleCommand = async (botInstance: Bot, mockInteraction: MockInteraction) => {
    const handleCommand = (
      botInstance as unknown as { handleCommand: (interaction: unknown) => Promise<void> }
    ).handleCommand;
    await handleCommand.call(botInstance, mockInteraction);
  };

  beforeEach(async () => {
    await indexer.start();
  });

  it("generates manage URL with correct expiry time", async () => {
    const mockInteraction = createMockInteraction();
    await callHandleCommand(bot, mockInteraction);
    const reply = mockInteraction.getCapturedReply();

    expect(reply).toContain("Here's your file management link:");
    expect(reply).toContain("http://localhost:3000/manage");
    expect(reply).toContain("This link expires <t:");
    expect(reply).toContain(":R>.");
    expect(reply).toContain("userId=test-user-123");
    expect(reply).toContain("expiresAt=");
    expect(reply).toContain("signature=");
  });
});

describe("button interaction", () => {
  /**
   * Mock Discord button interaction object for testing button clicks
   */
  type MockButtonInteraction = {
    customId: string;
    user: { id: string };
    deferReply: (options?: { ephemeral?: boolean }) => Promise<void>;
    editReply: (options: { content: string }) => Promise<{ content: string }>;
    reply: (options: { content: string; ephemeral?: boolean }) => Promise<{ content: string }>;
  };

  /**
   * Creates a mock Discord button interaction with reply capture
   */
  const createMockButtonInteraction = (
    customId: string,
  ): MockButtonInteraction & { getCapturedReply: () => string } => {
    let capturedReply = "";
    return {
      customId,
      user: { id: "test-user-123" },
      deferReply: async () => {
        /* intentionally empty */
      },
      editReply: async (options: { content: string }) => {
        capturedReply = options.content;
        return options;
      },
      reply: async (options: { content: string; ephemeral?: boolean }) => {
        capturedReply = options.content;
        return options;
      },
      getCapturedReply: () => capturedReply,
    };
  };

  /**
   * Invokes the bot's handleButton method with a mock interaction
   */
  const callHandleButton = async (botInstance: Bot, mockInteraction: MockButtonInteraction) => {
    const handleButton = (
      botInstance as unknown as { handleButton: (interaction: unknown) => Promise<void> }
    ).handleButton;
    await handleButton.call(botInstance, mockInteraction);
  };

  beforeEach(async () => {
    await indexer.start();
  });

  it("replies to unknown button interactions", async () => {
    const mockInteraction = createMockButtonInteraction("unknown_button:some_data");
    await callHandleButton(bot, mockInteraction);
    expect(mockInteraction.getCapturedReply()).toBe("Unknown button interaction.");
  });
});
