import { createHmac, timingSafeEqual } from "node:crypto";
import Cap from "@cap.js/server";
import { logger } from "./logger.js";

/**
 * Challenge data returned when generating a new challenge.
 */
export interface ChallengeData {
  challenge: {
    c: number;
    s: number;
    d: number;
  };
  token: string;
  signature: string;
}

/**
 * Result of verifying a captcha solution.
 */
export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Configuration for the captcha manager.
 */
export interface CaptchaConfig {
  hmacSecret: string;
  challengeCount?: number;
  challengeDifficulty?: number;
  expiresMs?: number;
}

/**
 * Stateless captcha manager using HMAC-signed challenges.
 * Challenges are ephemeral and bound to (userId, fileId) tuples.
 */
export class CaptchaManager {
  private readonly cap: Cap;
  private readonly hmacSecret: string;
  private readonly challengeCount: number;
  private readonly challengeDifficulty: number;
  private readonly expiresMs: number;
  private readonly challenges: Map<string, { c: number; s: number; d: number }> = new Map();

  constructor(config: CaptchaConfig) {
    this.hmacSecret = config.hmacSecret;
    this.challengeCount = config.challengeCount ?? 50;
    this.challengeDifficulty = config.challengeDifficulty ?? 4;
    this.expiresMs = config.expiresMs ?? 600000;

    this.cap = new Cap({
      noFSState: true,
      disableAutoCleanup: true,
    });
  }

  /**
   * Generate a captcha challenge for a specific user and file.
   * Returns challenge data and HMAC signature binding the challenge to (userId, fileId).
   */
  async generateChallenge(userId: string, fileId: string): Promise<ChallengeData> {
    const result = await this.cap.createChallenge({
      challengeCount: this.challengeCount,
      challengeDifficulty: this.challengeDifficulty,
      expiresMs: this.expiresMs,
    });

    const token = result.token;
    if (!token) {
      throw new Error("Failed to generate challenge token");
    }

    this.challenges.set(token, result.challenge);

    const challengeStr = JSON.stringify(result.challenge);
    const signature = this.createSignature(userId, fileId, token, challengeStr);

    logger.debug({ userId, fileId, token }, "Generated captcha challenge");

    return {
      challenge: result.challenge,
      token,
      signature,
    };
  }

  /**
   * Verify a captcha challenge with string-based inputs (for web API).
   * Parses challenge JSON and solution CSV, then validates.
   */
  async verifyChallenge(
    challengeStr: string,
    signature: string,
    solutionStr: string,
    userId: string,
    fileId: string,
  ): Promise<boolean> {
    try {
      const challenge = JSON.parse(challengeStr);
      const solutions = solutionStr.split(",").map((s) => Number.parseInt(s.trim(), 10));

      const result = await this.verifySolution(userId, fileId, challenge, signature, solutions);
      return result.valid;
    } catch (error) {
      logger.error({ error, userId, fileId }, "Failed to parse challenge or solution");
      return false;
    }
  }

  /**
   * Verify a captcha solution for a specific user and file.
   * Checks HMAC signature and validates the PoW solution.
   */
  async verifySolution(
    userId: string,
    fileId: string,
    challenge: { c: number; s: number; d: number },
    signature: string,
    solutions: number[],
  ): Promise<VerificationResult> {
    let token: string | null = null;
    for (const [t, c] of this.challenges.entries()) {
      if (c.c === challenge.c && c.s === challenge.s && c.d === challenge.d) {
        token = t;
        break;
      }
    }

    if (!token) {
      logger.warn({ userId, fileId }, "Challenge not found");
      return { valid: false, reason: "Challenge not found" };
    }

    const challengeStr = JSON.stringify(challenge);
    const expectedSignature = this.createSignature(userId, fileId, token, challengeStr);

    if (!this.verifySignature(signature, expectedSignature)) {
      logger.warn({ userId, fileId, token }, "Invalid captcha signature");
      return { valid: false, reason: "Invalid signature" };
    }

    try {
      const result = await this.cap.redeemChallenge({
        token,
        solutions,
      });

      this.challenges.delete(token);

      if (result.success) {
        logger.info({ userId, fileId, token }, "Captcha solution verified");
        return { valid: true };
      }

      logger.warn({ userId, fileId, token }, "Invalid captcha solution");
      return { valid: false, reason: "Invalid solution" };
    } catch (error) {
      logger.error({ error, userId, fileId, token }, "Failed to verify captcha solution");
      return { valid: false, reason: "Verification failed" };
    }
  }

  /**
   * Create HMAC signature for (userId, fileId, token, challenge) tuple.
   */
  private createSignature(
    userId: string,
    fileId: string,
    token: string,
    challengeStr: string,
  ): string {
    const data = `${userId}:${fileId}:${token}:${challengeStr}`;
    return createHmac("sha256", this.hmacSecret).update(data).digest("hex");
  }

  /**
   * Verify HMAC signature using timing-safe comparison.
   */
  private verifySignature(received: string, expected: string): boolean {
    try {
      const receivedBuf = Buffer.from(received, "hex");
      const expectedBuf = Buffer.from(expected, "hex");

      if (receivedBuf.length !== expectedBuf.length) {
        return false;
      }

      return timingSafeEqual(receivedBuf, expectedBuf);
    } catch {
      return false;
    }
  }
}
