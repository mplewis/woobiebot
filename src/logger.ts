import pino from "pino";

const isDevelopment = process.env["NODE_ENV"] !== "production";

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
export const logger = pino(loggerOptions);
