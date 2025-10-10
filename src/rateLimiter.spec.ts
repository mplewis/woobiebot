import { beforeEach, describe, expect, it } from "vitest";
import { RateLimiter } from "./rateLimiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(10, 3600);
  });

  it("allows requests when under limit", () => {
    const result = limiter.consume("user1");

    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(9);
  });

  it("tracks remaining tokens correctly", () => {
    limiter.consume("user1");
    limiter.consume("user1");
    const result = limiter.consume("user1");

    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(7);
  });

  it("blocks requests when limit exceeded", () => {
    for (let i = 0; i < 10; i++) {
      limiter.consume("user1");
    }
    const result = limiter.consume("user1");

    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBe(0);
  });

  it("tracks different users separately", () => {
    for (let i = 0; i < 10; i++) {
      limiter.consume("user1");
    }
    const result = limiter.consume("user2");

    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(9);
  });

  it("refills tokens over time", () => {
    limiter = new RateLimiter(10, 1);

    for (let i = 0; i < 10; i++) {
      limiter.consume("user1", new Date(0));
    }

    let result = limiter.consume("user1", new Date(0));
    expect(result.allowed).toBe(false);

    result = limiter.consume("user1", new Date(150));
    expect(result.allowed).toBe(true);
  });

  it("caps tokens at maximum", () => {
    limiter = new RateLimiter(5, 1);

    limiter.consume("user1", new Date(0));

    const state = limiter.getState("user1", new Date(2000));
    expect(state.remainingTokens).toBe(5);
  });

  it("gets state without consuming tokens", () => {
    limiter.consume("user1");
    const state1 = limiter.getState("user1");
    const state2 = limiter.getState("user1");

    expect(state1.remainingTokens).toBe(state2.remainingTokens);
    expect(state1.remainingTokens).toBe(9);
  });

  it("exports and imports state", () => {
    limiter.consume("user1");
    limiter.consume("user1");
    limiter.consume("user2");

    const exported = limiter.exportState();
    expect(exported).toHaveLength(2);

    const newLimiter = new RateLimiter(10, 3600);
    newLimiter.importState(exported);

    const state1 = newLimiter.getState("user1");
    const state2 = newLimiter.getState("user2");

    expect(state1.remainingTokens).toBe(8);
    expect(state2.remainingTokens).toBe(9);
  });

  it("clears all user data", () => {
    limiter.consume("user1");
    limiter.consume("user2");

    limiter.clear();

    const state = limiter.getState("user1");
    expect(state.remainingTokens).toBe(10);
  });

  it("provides reset timestamp", () => {
    const result = limiter.consume("user1", new Date(0));

    expect(result.resetAt.getTime()).toBe(3600 * 1000);
  });

  it("integration: shows token refill at 1 token/sec with successes and failures", () => {
    limiter = new RateLimiter(3, 3);

    // t=0: Start with 3 tokens, consume 3
    let result = limiter.consume("user1", new Date(0));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(2);

    result = limiter.consume("user1", new Date(0));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(1);

    result = limiter.consume("user1", new Date(0));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(0);

    // t=0: Out of tokens, should fail
    result = limiter.consume("user1", new Date(0));
    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBe(0);

    // t=0.5s: Only 0.5 tokens refilled, still not enough
    result = limiter.consume("user1", new Date(500));
    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBe(0);

    // t=1s: 1 token refilled, should succeed
    result = limiter.consume("user1", new Date(1000));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(0);

    // t=1s: Immediately after, should fail
    result = limiter.consume("user1", new Date(1000));
    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBe(0);

    // t=2.5s: 1.5 tokens refilled, should succeed (consuming 1)
    result = limiter.consume("user1", new Date(2500));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(0);

    // t=2.5s: Immediately after, should fail
    result = limiter.consume("user1", new Date(2500));
    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBe(0);

    // t=5s: 2.5 tokens refilled since t=2.5s, should succeed
    result = limiter.consume("user1", new Date(5000));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(2);

    // t=5s: Still have 2 tokens, should succeed
    result = limiter.consume("user1", new Date(5000));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(1);

    // t=5s: Still have 1 token, should succeed
    result = limiter.consume("user1", new Date(5000));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(0);

    // t=5s: Now out of tokens, should fail
    result = limiter.consume("user1", new Date(5000));
    expect(result.allowed).toBe(false);
    expect(result.remainingTokens).toBe(0);

    // t=10s: Fully refilled to 3 tokens cap, consume 2
    result = limiter.consume("user1", new Date(10000));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(2);

    result = limiter.consume("user1", new Date(10000));
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(1);
  });
});
