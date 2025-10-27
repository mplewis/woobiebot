/**
 * Test setup configuration for test environment.
 */
import { setMaxListeners } from "node:events";
import { Crypto } from "@peculiar/webcrypto";
import { vi } from "vitest";

/**
 * Prevent EventEmitter memory leak warnings.
 * Sets unlimited max listeners on the process object since tests legitimately
 * create many Fastify and Chokidar instances that add signal handlers.
 */
setMaxListeners(0, process);

/**
 * Polyfill crypto.subtle for Node environment.
 * Frontend code uses Web Crypto API which isn't available in Node by default.
 */
if (!globalThis.crypto) {
  // biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with global crypto type
  globalThis.crypto = new Crypto() as any;
}

/**
 * Mock fetch globally to prevent network requests in tests.
 * Individual tests can override this mock with vi.mocked(fetch).mockResolvedValue(...).
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for compatibility with global fetch type
globalThis.fetch = vi.fn(() =>
  Promise.reject(new Error("Network requests not allowed in tests")),
) as any;
