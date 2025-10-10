import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { logger } from "./logger.js";

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetAt: Date;
}

/**
 * Schema for persisted rate limit data for a single user.
 */
const rateLimitDataSchema = z.object({
  userId: z.string(),
  tokens: z.number(),
  lastRefill: z.number(),
});

/**
 * Leaky bucket rate limiter that tracks download limits per user.
 * Tokens leak (refill) at a constant rate based on the configured window.
 * Rate limit data is persisted to disk as flat files (one file per user).
 */
export class RateLimiter {
  private readonly maxTokens: number;
  /**
   * Refill rate in tokens per second.
   */
  private readonly tokensPerSec: number;
  private readonly users: Map<
    string,
    { userId: string; tokens: number; lastRefill: number }
  > = new Map();
  private readonly storageDir: string;

  /**
   * @param maxDownloads Maximum number of downloads allowed
   * @param windowSecs Time window in seconds
   * @param storageDir Directory to store rate limit data files
   */
  constructor(maxDownloads: number, windowSecs: number, storageDir: string) {
    this.maxTokens = maxDownloads;
    this.tokensPerSec = maxDownloads / windowSecs;
    this.storageDir = storageDir;
  }

  /**
   * Get the file path for a user's rate limit data.
   */
  private getUserFilePath(userId: string): string {
    return path.join(this.storageDir, `${userId}.json`);
  }

  /**
   * Load rate limit data for a user from disk.
   */
  private async loadUserData(userId: string): Promise<{ userId: string; tokens: number; lastRefill: number } | null> {
    try {
      const filePath = this.getUserFilePath(userId);
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);
      const validated = rateLimitDataSchema.safeParse(parsed);

      if (!validated.success) {
        logger.warn({ userId, error: validated.error }, "Corrupt rate limit data, treating as empty");
        return null;
      }

      return validated.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      logger.warn({ userId, error }, "Failed to load rate limit data");
      return null;
    }
  }

  /**
   * Save rate limit data for a user to disk.
   */
  private async saveUserData(userLimit: { userId: string; tokens: number; lastRefill: number }): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      const filePath = this.getUserFilePath(userLimit.userId);
      const data = JSON.stringify(userLimit);
      await fs.writeFile(filePath, data, "utf-8");
    } catch (error) {
      logger.error({ userId: userLimit.userId, error }, "Failed to save rate limit data");
    }
  }

  /**
   * Check if a user can perform a download and consume a token if allowed.
   * @param userId Discord user ID
   * @param at Optional timestamp for testing
   * @returns Rate limit result with allowed status and remaining tokens
   */
  async consume(userId: string, at?: Date): Promise<RateLimitResult> {
    const now = at !== undefined ? at.getTime() : Date.now();
    let userLimit = this.users.get(userId);

    if (!userLimit) {
      const loaded = await this.loadUserData(userId);
      if (loaded) {
        userLimit = loaded;
        this.users.set(userId, userLimit);
      } else {
        userLimit = {
          userId,
          tokens: this.maxTokens - 1,
          lastRefill: now,
        };
        this.users.set(userId, userLimit);
        await this.saveUserData(userLimit);

        logger.debug({ userId, tokens: userLimit.tokens }, "New user initialized");

        return {
          allowed: true,
          remainingTokens: userLimit.tokens,
          resetAt: new Date(now + (this.maxTokens / this.tokensPerSec) * 1000),
        };
      }
    }

    const timePassedSec = (now - userLimit.lastRefill) / 1000;
    const tokensToAdd = timePassedSec * this.tokensPerSec;
    userLimit.tokens = Math.min(this.maxTokens, userLimit.tokens + tokensToAdd);
    userLimit.lastRefill = now;

    if (userLimit.tokens >= 1) {
      userLimit.tokens -= 1;
      await this.saveUserData(userLimit);

      logger.debug(
        { userId, tokens: userLimit.tokens, tokensAdded: tokensToAdd },
        "Download allowed",
      );

      return {
        allowed: true,
        remainingTokens: Math.floor(userLimit.tokens),
        resetAt: new Date(now + ((this.maxTokens - userLimit.tokens) / this.tokensPerSec) * 1000),
      };
    }

    await this.saveUserData(userLimit);

    logger.info({ userId, tokens: userLimit.tokens }, "Rate limit exceeded");

    return {
      allowed: false,
      remainingTokens: 0,
      resetAt: new Date(now + ((1 - userLimit.tokens) / this.tokensPerSec) * 1000),
    };
  }

  /**
   * Get current rate limit state for a user without consuming a token.
   * @param userId Discord user ID
   * @param at Optional timestamp for testing
   */
  async getState(userId: string, at?: Date): Promise<RateLimitResult> {
    const now = at !== undefined ? at.getTime() : Date.now();
    let userLimit = this.users.get(userId);

    if (!userLimit) {
      const loaded = await this.loadUserData(userId);
      if (loaded) {
        userLimit = loaded;
        this.users.set(userId, userLimit);
      } else {
        return {
          allowed: true,
          remainingTokens: this.maxTokens,
          resetAt: new Date(now + (this.maxTokens / this.tokensPerSec) * 1000),
        };
      }
    }

    const timePassedSec = (now - userLimit.lastRefill) / 1000;
    const tokensToAdd = timePassedSec * this.tokensPerSec;
    const currentTokens = Math.min(this.maxTokens, userLimit.tokens + tokensToAdd);

    return {
      allowed: currentTokens >= 1,
      remainingTokens: Math.floor(currentTokens),
      resetAt: new Date(now + ((this.maxTokens - currentTokens) / this.tokensPerSec) * 1000),
    };
  }

  /**
   * Clear all user rate limit data from memory and disk.
   */
  async clear(): Promise<void> {
    this.users.clear();
    try {
      const files = await fs.readdir(this.storageDir);
      await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map((file) => fs.unlink(path.join(this.storageDir, file))),
      );
      logger.info("Cleared all rate limit data");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error({ error }, "Failed to clear rate limit files");
      }
    }
  }
}
