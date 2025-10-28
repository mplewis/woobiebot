import dotenv from "dotenv";
import { z } from "zod";

if (process.env["NODE_ENV"] !== "test") {
  dotenv.config();
}

/**
 * Parse comma-separated key:value tag pairs into a Map.
 * Format: "key1:value1,key2:value2,key1:value3"
 * Result: Map { "key1" => ["value1", "value3"], "key2" => ["value2"] }
 */
export function parseTagPairs(val: string): Map<string, string[]> {
  if (!val) {
    return new Map<string, string[]>();
  }

  const map = new Map<string, string[]>();
  const pairs = val
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const pair of pairs) {
    const colonIndex = pair.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = pair.slice(0, colonIndex).trim();
    const value = pair.slice(colonIndex + 1).trim();

    if (!key || !value) {
      continue;
    }

    if (!map.has(key)) {
      map.set(key, []);
    }
    const values = map.get(key);
    if (values) {
      values.push(value);
    }
  }

  return map;
}

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "Discord token is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "Discord client ID is required"),
  DISCORD_GUILD_IDS: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? val
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : [],
    ),
  FILES_DIRECTORY: z.string().default("./files"),
  FILE_EXTENSIONS: z
    .string()
    .default("pdf,txt,doc,docx,zip,tar,gz")
    .transform((val) => val.split(",").map((ext) => `.${ext.trim().replace(/^\./, "")}`)),
  WEB_SERVER_PORT: z.coerce.number().int().positive().default(3000),
  WEB_SERVER_HOST: z.string().default("0.0.0.0"),
  WEB_SERVER_BASE_URL: z.string().url().default("http://localhost:3000"),
  SIGNING_SECRET: z.string().min(32, "Signing secret must be at least 32 characters"),
  URL_EXPIRY_SEC: z.coerce.number().int().positive().default(600),
  CAPTCHA_CHALLENGE_COUNT: z.coerce.number().int().positive().default(50),
  CAPTCHA_DIFFICULTY: z.coerce.number().int().positive().default(4),
  DOWNLOADS_PER_HR: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_STORAGE_DIR: z.string().default("tmp/rate_limit"),
  SEARCH_MIN_CHARS: z.coerce.number().int().positive().default(3),
  SEARCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
  SCAN_INTERVAL_MINS: z.coerce.number().nonnegative().default(15),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DISCORD_LOGGING_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_LOGGING_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("error"),
  DISCORD_LOGGING_TAGS: z.string().default("").transform(parseTagPairs),
});

/**
 * Application configuration schema derived from environment variables.
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables.
 * @returns Validated configuration object
 * @throws Error if required configuration is missing or invalid
 */
export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((err) => `${err.path.join(".")}: ${err.message}`);
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }

  return result.data;
}

/**
 * Global configuration instance loaded from environment variables.
 */
export const config = loadConfig();
