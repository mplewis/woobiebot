import { readFile, writeFile } from "node:fs/promises";
import { logger } from "./logger.js";
import type { UserRateLimit } from "./rateLimiter.js";

/**
 * Persist and restore rate limiter state to/from disk.
 */
export class RateLimitPersistence {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Save rate limit state to disk.
   */
  async save(states: UserRateLimit[]): Promise<void> {
    const data = JSON.stringify(states, null, 2);
    await writeFile(this.filePath, data, "utf-8");
    logger.debug({ filePath: this.filePath, userCount: states.length }, "Saved rate limit state");
  }

  /**
   * Load rate limit state from disk.
   */
  async load(): Promise<UserRateLimit[]> {
    try {
      const data = await readFile(this.filePath, "utf-8");
      const states = JSON.parse(data) as UserRateLimit[];
      logger.debug(
        { filePath: this.filePath, userCount: states.length },
        "Loaded rate limit state",
      );
      return states;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.debug({ filePath: this.filePath }, "No existing rate limit state file");
        return [];
      }
      throw error;
    }
  }
}
