import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
 * Persisted rate limit state for a user.
 */
export interface UserRateLimit {
  userId: string;
  tokens: number;
  lastRefill: number;
}

/**
 * Leaky bucket rate limiter that tracks download limits per user.
 * Tokens leak (refill) at a constant rate based on the configured window.
 */
export class RateLimiter {
  private readonly maxTokens: number;
  /**
   * Refill rate in tokens per second.
   */
  private readonly tokensPerSec: number;
  private readonly users: Map<string, UserRateLimit> = new Map();

  /**
   * @param maxDownloads Maximum number of downloads allowed
   * @param windowSecs Time window in seconds
   */
  constructor(maxDownloads: number, windowSecs: number) {
    this.maxTokens = maxDownloads;
    this.tokensPerSec = maxDownloads / windowSecs;
  }

  /**
   * Check if a user can perform a download and consume a token if allowed.
   * @param userId Discord user ID
   * @param at Optional timestamp for testing
   * @returns Rate limit result with allowed status and remaining tokens
   */
  consume(userId: string, at?: Date): RateLimitResult {
    const now = at !== undefined ? at.getTime() : Date.now();
    let userLimit = this.users.get(userId);

    if (!userLimit) {
      userLimit = {
        userId,
        tokens: this.maxTokens - 1,
        lastRefill: now,
      };
      this.users.set(userId, userLimit);

      logger.debug({ userId, tokens: userLimit.tokens }, "New user initialized");

      return {
        allowed: true,
        remainingTokens: userLimit.tokens,
        resetAt: new Date(now + (this.maxTokens / this.tokensPerSec) * 1000),
      };
    }

    const timePassedSec = (now - userLimit.lastRefill) / 1000;
    const tokensToAdd = timePassedSec * this.tokensPerSec;
    userLimit.tokens = Math.min(this.maxTokens, userLimit.tokens + tokensToAdd);
    userLimit.lastRefill = now;

    if (userLimit.tokens >= 1) {
      userLimit.tokens -= 1;

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
  getState(userId: string, at?: Date): RateLimitResult {
    const now = at !== undefined ? at.getTime() : Date.now();
    const userLimit = this.users.get(userId);

    if (!userLimit) {
      return {
        allowed: true,
        remainingTokens: this.maxTokens,
        resetAt: new Date(now + (this.maxTokens / this.tokensPerSec) * 1000),
      };
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
   * Export all user rate limit states.
   */
  exportState(): UserRateLimit[] {
    return Array.from(this.users.values());
  }

  /**
   * Import user rate limit states.
   */
  importState(states: UserRateLimit[]): void {
    this.users.clear();
    for (const state of states) {
      this.users.set(state.userId, state);
    }
    logger.info({ userCount: states.length }, "Imported rate limit state");
  }

  /**
   * Clear all user rate limit data.
   */
  clear(): void {
    this.users.clear();
    logger.info("Cleared all rate limit data");
  }

  /**
   * Save rate limit state to a file.
   */
  async save(filePath: string): Promise<void> {
    const state = this.exportState();
    const json = JSON.stringify(state, null, 2);
    writeFileSync(filePath, json, "utf-8");
    logger.info({ filePath, userCount: state.length }, "Saved rate limit state");
  }

  /**
   * Load rate limit state from a file.
   */
  async load(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      logger.info({ filePath }, "No existing rate limit state file found");
      return;
    }

    const json = readFileSync(filePath, "utf-8");
    const state = JSON.parse(json) as UserRateLimit[];
    this.importState(state);
    logger.info({ filePath, userCount: state.length }, "Loaded rate limit state");
  }
}
