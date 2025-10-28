import type { Challenge } from "../../shared/types.js";

/**
 * Generates a deterministic pseudo-random hex string using FNV-1a hash for seeding
 * and xorshift algorithm for generation.
 *
 * @param seed - Input string to seed the random number generator
 * @param length - Desired length of the output hex string
 * @returns A deterministic hex string of the specified length
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
 * Solves a single proof-of-work challenge by finding a nonce that produces
 * a SHA-256 hash starting with the target string.
 *
 * @param salt - The salt string to prepend to each nonce attempt
 * @param target - The hex string that the hash must start with
 * @returns The nonce that solves the challenge
 * @throws Error if no solution is found within 10,000,000 attempts
 */
export async function solveChallenge(salt: string, target: string): Promise<number> {
  const encoder = new TextEncoder();
  for (let nonce = 0; nonce < 10000000; nonce++) {
    const data = encoder.encode(salt + nonce.toString());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hash.startsWith(target)) {
      return nonce;
    }
  }
  throw new Error(`Failed to solve challenge with target ${target} after 10,000,000 attempts`);
}

/**
 * Solves multiple captcha challenges in sequence, optionally reporting progress.
 * Each challenge uses a deterministically generated salt and target based on the token.
 *
 * @param token - Unique token for this captcha session
 * @param challenge - Challenge parameters including count, salt length, and difficulty
 * @param onProgress - Optional callback invoked after each challenge is solved with (current, total)
 * @returns Array of nonces that solve each challenge
 */
export async function solveCaptcha(
  token: string,
  challenge: Challenge,
  onProgress?: (current: number, total: number) => void,
): Promise<number[]> {
  const solutions: number[] = [];
  onProgress?.(0, challenge.c);
  for (let i = 1; i <= challenge.c; i++) {
    const salt = prng(`${token}${i}`, challenge.s);
    const target = prng(`${token}${i}d`, challenge.d);
    const solution = await solveChallenge(salt, target);
    solutions.push(solution);
    onProgress?.(i, challenge.c);
  }
  return solutions;
}
