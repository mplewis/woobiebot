import pino from "pino";
import type { ErrorOutbox } from "./errorOutbox.js";

/**
 * Whether the application is running in development mode.
 */
const isDevelopment = process.env["NODE_ENV"] !== "production";

/**
 * Configuration options for the Pino logger.
 */
const loggerOptions: pino.LoggerOptions = {
  level: process.env["LOG_LEVEL"] ?? "info",
};

if (isDevelopment) {
  loggerOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
    },
  };
}

/**
 * Application-wide logger instance using Pino.
 * Configured with pretty-printing in development and JSON output in production.
 */
export const log = pino(loggerOptions);

let discordOutbox: ErrorOutbox | null = null;

/**
 * Enable Discord error logging by providing an ErrorOutbox instance.
 * This will send all error and warn level logs to Discord.
 * @param outbox - ErrorOutbox instance to send error and warn logs to
 */
export function enableDiscordLogging(outbox: ErrorOutbox): void {
  discordOutbox = outbox;

  const originalError = log.error.bind(log) as (...args: unknown[]) => void;

  (log as { error: (...args: unknown[]) => void }).error = (...args: unknown[]) => {
    originalError(...args);
    if (discordOutbox) {
      discordOutbox.addFromPinoLog(args[0], args.slice(1));
    }
  };
}
