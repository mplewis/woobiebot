import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "Discord token is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "Discord client ID is required"),
  FILES_DIRECTORY: z.string().default("./files"),
  FILE_EXTENSIONS: z
    .string()
    .default(".pdf,.txt,.doc,.docx,.zip,.tar,.gz")
    .transform((val) => val.split(",").map((ext) => ext.trim())),
  CAPTCHA_PORT: z.coerce.number().int().positive().default(3000),
  RATE_LIMIT_DOWNLOADS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(3600000),
  DATABASE_PATH: z.string().default("./woobiebot.db"),
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
