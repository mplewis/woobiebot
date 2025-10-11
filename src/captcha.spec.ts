import { beforeEach, describe, expect, it } from "vitest";
import { CaptchaManager } from "./captcha.js";
import { solveCaptcha } from "./testUtils.js";

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
        challenge.token,
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
        challenge.token,
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
        challenge.token,
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
        challenge.token,
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
        challenge.token,
        tamperedChallenge,
        challenge.signature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Challenge mismatch");
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
        challengeData.token,
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
        challenge.token,
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
        challenge.token,
        challenge.challenge,
        invalidSignature,
        [0, 1, 2],
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Invalid signature");
    });
  });
});
