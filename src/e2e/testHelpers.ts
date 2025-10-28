import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaptchaManager } from "../captcha.js";
import type { Config } from "../config.js";
import { FileIndexer } from "../indexer.js";
import { log } from "../logger.js";
import { RateLimiter } from "../rateLimiter.js";
import { WebServer, type WebServerDependencies } from "../webServer.js";

/**
 * Test context containing all dependencies for E2E testing.
 */
export interface E2ETestContext {
  server: WebServer;
  tempDir: string;
  indexer: FileIndexer;
  captchaManager: CaptchaManager;
  rateLimiter: RateLimiter;
  config: Config;
  cleanup: () => Promise<void>;
}

/**
 * Options for creating an E2E test context.
 */
export interface E2ETestOptions {
  testName: string;
  configOverrides?: Partial<Config>;
}

const DEFAULT_CONFIG = {
  DISCORD_TOKEN: "test_token",
  DISCORD_CLIENT_ID: "test_client_id",
  DISCORD_GUILD_IDS: [],
  FILE_EXTENSIONS: [".txt"],
  WEB_SERVER_PORT: 3001,
  WEB_SERVER_HOST: "127.0.0.1",
  WEB_SERVER_BASE_URL: "http://localhost:3001",
  SIGNING_SECRET: "test-signing-secret-key-must-be-long-enough",
  URL_EXPIRY_SEC: 600,
  MANAGE_URL_EXPIRY_SEC: 3600,
  CAPTCHA_CHALLENGE_COUNT: 50,
  CAPTCHA_DIFFICULTY: 4,
  DOWNLOADS_PER_HR: 10,
  SEARCH_MIN_CHARS: 3,
  SEARCH_THRESHOLD: 0.6,
  SCAN_INTERVAL_MINS: 15,
  MAX_FILE_SIZE_MB: 1,
  LOG_LEVEL: "error",
  NODE_ENV: "test",
  DISCORD_LOGGING_LEVEL: "error",
  DISCORD_LOGGING_TAGS: new Map<string, string[]>(),
} as const;

/**
 * Creates default test configuration for E2E tests.
 *
 * @param testName - Name of the test (used for rate limit directory)
 * @param tempDir - Temporary directory for test files
 * @returns Default test configuration
 */
export function createDefaultE2EConfig(testName: string, tempDir: string): Config {
  return {
    FILES_DIRECTORY: tempDir,
    RATE_LIMIT_STORAGE_DIR: `tmp/test-rate-limit-${testName}`,
    ...DEFAULT_CONFIG,
  };
}

/**
 * Creates a complete E2E test context with all required dependencies.
 *
 * @param options - Configuration for the test context
 * @returns Test context with server, indexer, and other dependencies
 */
export async function createE2ETestContext(options: E2ETestOptions): Promise<E2ETestContext> {
  const { testName, configOverrides = {} } = options;

  const tempDir = await mkdtemp(join(tmpdir(), `${testName}-test-`));
  const defaultConfig = createDefaultE2EConfig(testName, tempDir);
  const config: Config = { ...defaultConfig, ...configOverrides };

  const captchaManager = new CaptchaManager({
    hmacSecret: config.SIGNING_SECRET,
    challengeCount: 3,
    challengeDifficulty: 2,
    expiresMs: config.URL_EXPIRY_SEC * 1000,
  });

  const rateLimiter = new RateLimiter(config.DOWNLOADS_PER_HR, 3600, config.RATE_LIMIT_STORAGE_DIR);

  const indexer = new FileIndexer({
    directory: tempDir,
    extensions: config.FILE_EXTENSIONS,
  });
  await indexer.start();

  const deps: WebServerDependencies = {
    config,
    captchaManager,
    rateLimiter,
    indexer,
    log,
  };

  const server = new WebServer(deps);

  const cleanup = async () => {
    await server.stop();
    indexer.stop();
    await rateLimiter.clear();
    await rm(tempDir, { recursive: true, force: true });
  };

  return {
    server,
    tempDir,
    indexer,
    captchaManager,
    rateLimiter,
    config,
    cleanup,
  };
}
