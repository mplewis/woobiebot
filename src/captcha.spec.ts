import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { CaptchaManager } from "./captcha.js";

/**
 * PRNG function from Cap.js for generating deterministic challenges.
 */
function prng(seed: string, length: number): string {
  function fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
  }

  let state = fnv1a(seed);
  let result = "";

  function next(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  }

  while (result.length < length) {
    const rnd = next();
    result += rnd.toString(16).padStart(8, "0");
  }

  return result.substring(0, length);
}

/**
 * Solve a single PoW challenge by finding a nonce that makes SHA256(salt + nonce) start with target.
 */
function solveChallenge(salt: string, target: string): number {
  for (let nonce = 0; nonce < 10000000; nonce++) {
    const hash = createHash("sha256")
      .update(salt + nonce)
      .digest("hex");

    if (hash.startsWith(target)) {
      return nonce;
    }
  }

  throw new Error(`Failed to solve challenge with target ${target}`);
}

/**
 * Solve all challenges for a Cap.js PoW.
 */
function solveCaptcha(token: string, challenge: { c: number; s: number; d: number }): number[] {
  const solutions: number[] = [];

  for (let i = 1; i <= challenge.c; i++) {
    const salt = prng(`${token}${i}`, challenge.s);
    const target = prng(`${token}${i}d`, challenge.d);
    const solution = solveChallenge(salt, target);
    solutions.push(solution);
  }

  return solutions;
}

describe("CaptchaManager", () => {
  let manager: CaptchaManager;
  const hmacSecret = "test-secret-key-for-hmac";

  beforeEach(() => {
    manager = new CaptchaManager({
      hmacSecret,
      challengeCount: 10,
      challengeDifficulty: 1,
      expiresMs: 60000,
    });
  });

  describe("generateChallenge", () => {
    it("generates a challenge with signature", async () => {
      const result = await manager.generateChallenge("user1", "file1");

      expect(result.challenge).toHaveProperty("c");
      expect(result.challenge).toHaveProperty("s");
      expect(result.challenge).toHaveProperty("d");
      expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it("generates different signatures for different users", async () => {
      const result1 = await manager.generateChallenge("user1", "file1");
      const result2 = await manager.generateChallenge("user2", "file1");

      expect(result1.signature).not.toBe(result2.signature);
    });

    it("generates different signatures for different files", async () => {
      const result1 = await manager.generateChallenge("user1", "file1");
      const result2 = await manager.generateChallenge("user1", "file2");

      expect(result1.signature).not.toBe(result2.signature);
    });

    it("generates different signatures for different challenges", async () => {
      const result1 = await manager.generateChallenge("user1", "file1");
      const result2 = await manager.generateChallenge("user1", "file1");

      expect(result1.signature).not.toBe(result2.signature);
    });
  });

  describe("verifySolution", () => {
    it("rejects invalid signature", async () => {
      const challenge = await manager.generateChallenge("user1", "file1");
      const fakeSignature = "0".repeat(64);

      const result = await manager.verifySolution(
        "user1",
        "file1",
        challenge.challenge,
        fakeSignature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });

    it("rejects signature for different user", async () => {
      const challenge = await manager.generateChallenge("user1", "file1");

      const result = await manager.verifySolution(
        "user2",
        "file1",
        challenge.challenge,
        challenge.signature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });

    it("rejects signature for different file", async () => {
      const challenge = await manager.generateChallenge("user1", "file1");

      const result = await manager.verifySolution(
        "user1",
        "file2",
        challenge.challenge,
        challenge.signature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });

    it("rejects invalid solution with valid signature", async () => {
      const challenge = await manager.generateChallenge("user1", "file1");
      const invalidSolutions = [999, 999, 999];

      const result = await manager.verifySolution(
        "user1",
        "file1",
        challenge.challenge,
        challenge.signature,
        invalidSolutions,
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid solution");
    });

    it("rejects tampered challenge data", async () => {
      const challenge = await manager.generateChallenge("user1", "file1");

      const tamperedChallenge = {
        ...challenge.challenge,
        c: challenge.challenge.c + 1,
      };

      const result = await manager.verifySolution(
        "user1",
        "file1",
        tamperedChallenge,
        challenge.signature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Challenge not found");
    });

    it("accepts correctly solved captcha", async () => {
      const manager = new CaptchaManager({
        hmacSecret,
        challengeCount: 3,
        challengeDifficulty: 3,
        expiresMs: 60000,
      });

      const challengeData = await manager.generateChallenge("user1", "file1");

      const solutions = solveCaptcha(challengeData.token, challengeData.challenge);

      const result = await manager.verifySolution(
        "user1",
        "file1",
        challengeData.challenge,
        challengeData.signature,
        solutions,
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("signature security", () => {
    it("uses different signatures with different HMAC secrets", async () => {
      const manager1 = new CaptchaManager({ hmacSecret: "secret1" });
      const manager2 = new CaptchaManager({ hmacSecret: "secret2" });

      const result1 = await manager1.generateChallenge("user1", "file1");
      const result2 = await manager2.generateChallenge("user1", "file1");

      expect(result1.signature).not.toBe(result2.signature);
    });

    it("rejects signature with wrong length", async () => {
      const challenge = await manager.generateChallenge("user1", "file1");
      const invalidSignature = "abc";

      const result = await manager.verifySolution(
        "user1",
        "file1",
        challenge.challenge,
        invalidSignature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });

    it("rejects non-hex signature", async () => {
      const challenge = await manager.generateChallenge("user1", "file1");
      const invalidSignature = "g".repeat(64);

      const result = await manager.verifySolution(
        "user1",
        "file1",
        challenge.challenge,
        invalidSignature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });
  });
});
