import { Bot } from "./bot.js";
import { CaptchaManager } from "./captcha.js";
import { config } from "./config.js";
import { FileIndexer } from "./indexer.js";
import { logger } from "./logger.js";
import { RateLimiter } from "./rateLimiter.js";
import { WebServer } from "./webServer.js";

/**
 * Main application entry point.
 * Initialize and start all services.
 */
async function main() {
  logger.info("Starting Woobiebot...");

  // Initialize file indexer
  const indexer = new FileIndexer(config.FILES_DIRECTORY, config.FILE_EXTENSIONS);

  await indexer.start();

  // Initialize rate limiter
  const rateLimiter = new RateLimiter(config.RATE_LIMIT_DOWNLOADS, config.RATE_LIMIT_WINDOW / 1000);

  // Initialize captcha manager
  const captchaManager = new CaptchaManager({
    hmacSecret: config.CAPTCHA_HMAC_SECRET,
    challengeCount: config.CAPTCHA_CHALLENGE_COUNT,
    challengeDifficulty: config.CAPTCHA_DIFFICULTY,
    expiresMs: config.CAPTCHA_EXPIRES_MS,
  });

  // Initialize web server
  const webServer = new WebServer({
    config,
    captchaManager,
    rateLimiter,
    indexer,
    logger,
  });

  await webServer.start();

  // Initialize Discord bot
  const bot = new Bot({
    config,
    indexer,
    rateLimiter,
    webServer,
    logger,
  });

  await bot.start();

  logger.info("Woobiebot started successfully");

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");

    try {
      await bot.stop();
      await webServer.stop();
      await indexer.stop();
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error during startup");
  process.exit(1);
});
