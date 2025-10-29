import { Bot } from "./bot.js";
import { CaptchaManager } from "./captcha.js";
import { config } from "./config.js";
import { FileIndexer } from "./indexer.js";
import { enableMessageOutbox, log } from "./logger.js";
import { getLevelsAtOrAbove, MessageOutbox } from "./messageOutbox.js";
import { RateLimiter } from "./rateLimiter.js";
import { WebServer } from "./webServer.js";

/**
 * Main application entry point.
 * Initialize and start all services.
 */
async function main() {
  log.info("Starting WoobieBot...");

  let messageOutbox: MessageOutbox | null = null;
  if (config.DISCORD_LOGGING_WEBHOOK_URL) {
    messageOutbox = new MessageOutbox(config.DISCORD_LOGGING_WEBHOOK_URL, log, {
      levels: getLevelsAtOrAbove(config.DISCORD_LOGGING_LEVEL),
      tags: config.DISCORD_LOGGING_TAGS,
    });
    messageOutbox.start();
    enableMessageOutbox(messageOutbox);
    log.info("Discord message logging enabled");
  }

  // Initialize file indexer
  const indexer = new FileIndexer({
    directory: config.FILES_DIRECTORY,
    extensions: config.FILE_EXTENSIONS,
    threshold: config.SEARCH_THRESHOLD,
    scanIntervalMins: config.SCAN_INTERVAL_MINS,
  });

  await indexer.start();

  // Initialize rate limiter
  const rateLimiter = new RateLimiter(config.DOWNLOADS_PER_HR, 3600, config.RATE_LIMIT_STORAGE_DIR);

  // Initialize captcha manager
  const captchaManager = new CaptchaManager({
    hmacSecret: config.SIGNING_SECRET,
    challengeCount: config.CAPTCHA_CHALLENGE_COUNT,
    challengeDifficulty: config.CAPTCHA_DIFFICULTY,
    expiresMs: config.URL_EXPIRY_SEC * 1000,
  });

  // Initialize web server
  const webServer = new WebServer({
    config,
    captchaManager,
    rateLimiter,
    indexer,
    log,
  });

  await webServer.start();

  // Initialize Discord bot
  const bot = new Bot({
    config,
    indexer,
    rateLimiter,
    webServer,
    log,
  });

  await bot.start();

  log.info("WoobieBot started successfully");

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, "Shutting down...");

    try {
      await bot.stop();
      await webServer.stop();
      indexer.stop();
      if (messageOutbox) {
        await messageOutbox.flush();
        await messageOutbox.stop();
      }
      log.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  log.fatal({ err }, "Fatal error during startup");
  process.exit(1);
});
