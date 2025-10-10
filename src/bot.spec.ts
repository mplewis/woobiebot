import { beforeEach, expect, it } from "vitest";
import { Bot } from "./bot.js";
import { CaptchaManager } from "./captcha.js";
import type { Config } from "./config.js";
import { FileIndexer } from "./indexer.js";
import { logger } from "./logger.js";
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
    FILES_DIRECTORY: "./test-files",
    FILE_EXTENSIONS: [".txt"],
    WEB_SERVER_PORT: 3000,
    WEB_SERVER_HOST: "127.0.0.1",
    WEB_SERVER_BASE_URL: "http://localhost:3000",
    SIGNING_SECRET: "test-secret-must-be-at-least-32-chars-long",
    URL_EXPIRY_SEC: 600,
    CAPTCHA_CHALLENGE_COUNT: 3,
    CAPTCHA_DIFFICULTY: 2,
    DOWNLOADS_PER_HR: 10,
    DATABASE_PATH: ":memory:",
    LOG_LEVEL: "fatal" as const,
    NODE_ENV: "test" as const,
  };

  indexer = new FileIndexer(config.FILES_DIRECTORY, config.FILE_EXTENSIONS);

  rateLimiter = new RateLimiter(config.DOWNLOADS_PER_HR, 3600);

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
    logger,
  });

  bot = new Bot({
    config,
    indexer,
    rateLimiter,
    webServer,
    logger,
  });
});

it("creates bot instance", () => {
  expect(bot).toBeDefined();
  expect(bot.getClient()).toBeDefined();
});

it("bot client has correct intents", () => {
  const client = bot.getClient();
  expect(client.options.intents).toBeDefined();
});
