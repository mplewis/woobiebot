import { describe, expect, it, vi } from "vitest";
import type { Challenge } from "../../shared/types.js";
import { prng, solveCaptcha, solveChallenge } from "./crypto.js";

describe("prng", () => {
  it("produces deterministic output for same seed", () => {
    const result1 = prng("test-seed", 32);
    const result2 = prng("test-seed", 32);
    expect(result1).toBe(result2);
  });

  it("produces output with correct length", () => {
    expect(prng("seed", 16).length).toBe(16);
    expect(prng("seed", 32).length).toBe(32);
    expect(prng("seed", 64).length).toBe(64);
  });

  it("produces different outputs for different seeds", () => {
    const result1 = prng("seed1", 32);
    const result2 = prng("seed2", 32);
    expect(result1).not.toBe(result2);
  });

  it("produces hex string output", () => {
    const result = prng("test", 32);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });
});

describe("solveChallenge", () => {
  it("finds nonce that produces hash starting with target", async () => {
    const salt = "test-salt";
    const target = "00";

    const nonce = await solveChallenge(salt, target);

    const encoder = new TextEncoder();
    const data = encoder.encode(salt + nonce.toString());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    expect(hash.startsWith(target)).toBe(true);
  });

  it("returns a non-negative integer", async () => {
    const nonce = await solveChallenge("salt", "0");
    expect(Number.isInteger(nonce)).toBe(true);
    expect(nonce).toBeGreaterThanOrEqual(0);
  });
});

describe("solveCaptcha", () => {
  it("returns array of solutions with correct length", async () => {
    const challenge: Challenge = {
      c: 3,
      s: 8,
      d: 1,
    };

    const solutions = await solveCaptcha("token", challenge);

    expect(solutions).toHaveLength(3);
    expect(solutions.every((s) => Number.isInteger(s) && s >= 0)).toBe(true);
  });

  it("calls onProgress callback with correct values", async () => {
    const challenge: Challenge = {
      c: 3,
      s: 8,
      d: 1,
    };

    const progressCalls: [number, number][] = [];
    const onProgress = vi.fn((current: number, total: number) => {
      progressCalls.push([current, total]);
    });

    await solveCaptcha("token", challenge, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(progressCalls[0]).toEqual([0, 3]);
    expect(progressCalls[1]).toEqual([1, 3]);
    expect(progressCalls[2]).toEqual([2, 3]);
    expect(progressCalls[3]).toEqual([3, 3]);
  });

  it("works without onProgress callback", async () => {
    const challenge: Challenge = {
      c: 2,
      s: 8,
      d: 1,
    };

    const solutions = await solveCaptcha("token", challenge);

    expect(solutions).toHaveLength(2);
  });

  it("uses deterministic salt and target based on token", async () => {
    const challenge: Challenge = {
      c: 2,
      s: 8,
      d: 1,
    };

    const solutions1 = await solveCaptcha("token1", challenge);
    const solutions2 = await solveCaptcha("token1", challenge);
    const solutions3 = await solveCaptcha("token2", challenge);

    expect(solutions1).toEqual(solutions2);
    expect(solutions1).not.toEqual(solutions3);
  });
});
