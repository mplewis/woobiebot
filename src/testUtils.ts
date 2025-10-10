import { createHash } from "node:crypto";

/**
 * PRNG function from Cap.js for generating deterministic challenges.
 * Use FNV-1a hash to seed a xorshift PRNG for reproducible sequences.
 */
export function prng(seed: string, length: number): string {
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
export function solveChallenge(salt: string, target: string): number {
  for (let nonce = 0; nonce < 10000000; nonce++) {
    const hash = createHash("sha256")
      .update(salt + nonce.toString())
      .digest("hex");
    if (hash.startsWith(target)) {
      return nonce;
    }
  }
  throw new Error(`Failed to solve challenge with target ${target}`);
}

/**
 * Solve all challenges for a Cap.js PoW captcha.
 */
export function solveCaptcha(
  token: string,
  challenge: { c: number; s: number; d: number },
): number[] {
  const solutions: number[] = [];
  for (let i = 1; i <= challenge.c; i++) {
    const salt = prng(`${token}${i}`, challenge.s);
    const target = prng(`${token}${i}d`, challenge.d);
    const solution = solveChallenge(salt, target);
    solutions.push(solution);
  }
  return solutions;
}
