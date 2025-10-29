import pino from "pino";
import type { MessageOutbox } from "./messageOutbox.js";

/**
 * Whether the application is running in development mode.
 */
const isDevelopment = process.env["NODE_ENV"] !== "production";

/**
 * Configuration options for the Pino logger.
 */
const loggerOptions: pino.LoggerOptions = {
  level: process.env["LOG_LEVEL"] ?? "info",
  hooks: {
    logMethod(inputArgs, method, level) {
      if (messageOutbox && inputArgs.length > 0) {
        const levelLabel = this.levels.labels[level] as "debug" | "info" | "warn" | "error";
        messageOutbox.addFromPinoLog(levelLabel, inputArgs[0], inputArgs.slice(1));
      }
      return method.apply(this, inputArgs);
    },
  },
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

let messageOutbox: MessageOutbox | null = null;

/**
 * Enables message outbox integration by hooking all log levels to forward messages to Discord.
 * Should be called once during application initialization.
 */
export function enableMessageOutbox(outbox: MessageOutbox): void {
  messageOutbox = outbox;
}
