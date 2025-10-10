import { config } from "./config.js";
import { FileIndexer } from "./indexer.js";
import { logger } from "./logger.js";

logger.info({ config }, "Starting Woobiebot");

const indexer = new FileIndexer(config.FILES_DIRECTORY, config.FILE_EXTENSIONS);
await indexer.start();

logger.info("Woobiebot initialized successfully");

process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  await indexer.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  await indexer.stop();
  process.exit(0);
});
