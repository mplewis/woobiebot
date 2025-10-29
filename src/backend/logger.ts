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

  const originalDebug = log.debug.bind(log) as (...args: unknown[]) => void;
  const originalInfo = log.info.bind(log) as (...args: unknown[]) => void;
  const originalWarn = log.warn.bind(log) as (...args: unknown[]) => void;
  const originalError = log.error.bind(log) as (...args: unknown[]) => void;

  (log as { debug: (...args: unknown[]) => void }).debug = (...args: unknown[]) => {
    originalDebug(...args);
    if (messageOutbox) {
      messageOutbox.addFromPinoLog("debug", args[0], args.slice(1));
    }
  };

  (log as { info: (...args: unknown[]) => void }).info = (...args: unknown[]) => {
    originalInfo(...args);
    if (messageOutbox) {
      messageOutbox.addFromPinoLog("info", args[0], args.slice(1));
    }
  };

  (log as { warn: (...args: unknown[]) => void }).warn = (...args: unknown[]) => {
    originalWarn(...args);
    if (messageOutbox) {
      messageOutbox.addFromPinoLog("warn", args[0], args.slice(1));
    }
  };

  (log as { error: (...args: unknown[]) => void }).error = (...args: unknown[]) => {
    originalError(...args);
    if (messageOutbox) {
      messageOutbox.addFromPinoLog("error", args[0], args.slice(1));
    }
  };
}
