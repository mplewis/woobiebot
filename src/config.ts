import dotenv from "dotenv";
import { z } from "zod";

if (process.env["NODE_ENV"] !== "test") {
  dotenv.config();
}

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "Discord token is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "Discord client ID is required"),
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
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

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

export const config = loadConfig();
