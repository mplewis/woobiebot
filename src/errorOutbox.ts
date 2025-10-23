import type { Logger } from "pino";
import { FILTERED_DISCORD_ERROR_CODES, FILTERED_SYSTEM_ERROR_CODES } from "./errorFilters.js";

/**
 * Maximum number of embeds allowed in a single Discord webhook message.
 */
const DISCORD_EMBED_LIMIT = 10;

/**
 * Interval in milliseconds between automatic flushes to Discord webhook.
 */
const FLUSH_INTERVAL_MS = 5000;

/**
 * Represents a queued error entry with deduplication metadata.
 */
interface ErrorEntry {
  level: "error" | "warn";
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * Result of extracting message, context, and stack from Pino log arguments.
 */
export interface ExtractedLogData {
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Extracts message, context, and stack trace from Pino log arguments.
 *
 * @param obj - First argument passed to Pino logger (may be an object or string)
 * @param args - Additional arguments passed to Pino logger
 * @returns Extracted message, optional context, and optional stack trace
 */
export function extractMessageContextStack(obj: unknown, args: unknown[]): ExtractedLogData {
  let message = "Unknown error";
  let context: Record<string, unknown> | undefined;
  let stack: string | undefined;

  if (typeof obj === "object" && obj !== null) {
    const logObj = obj as Record<string, unknown>;

    if (args.length > 0 && typeof args[0] === "string") {
      message = args[0];
    } else if (logObj["msg"] && typeof logObj["msg"] === "string") {
      message = logObj["msg"];
    } else if (logObj["err"] && typeof logObj["err"] === "object") {
      const err = logObj["err"] as Record<string, unknown>;
      if (typeof err["message"] === "string") {
        message = err["message"];
      }
    }

    const contextObj: Record<string, unknown> = {};
    const excludeKeys = new Set(["msg", "level", "time", "pid", "hostname"]);
    for (const [key, value] of Object.entries(logObj)) {
      if (!excludeKeys.has(key)) {
        contextObj[key] = value;
      }
    }
    if (Object.keys(contextObj).length > 0) {
      context = contextObj;
    }

    if (typeof logObj["stack"] === "string") {
      stack = logObj["stack"];
    } else if (logObj["err"] && typeof logObj["err"] === "object") {
      const err = logObj["err"] as Record<string, unknown>;
      if (typeof err["stack"] === "string") {
        stack = err["stack"];
      }
    }
  } else if (typeof obj === "string") {
    message = obj;
  }

  const result: ExtractedLogData = { message };
  if (context !== undefined) {
    result.context = context;
  }
  if (stack !== undefined) {
    result.stack = stack;
  }
  return result;
}

/**
 * Manages queuing and batching of error logs for Discord webhook delivery.
 * Deduplicates identical errors and sends them as Discord embeds every 5 seconds.
 */
export class ErrorOutbox {
  private readonly webhookUrl: string;
  private readonly log: Logger;
  private readonly entries: Map<string, ErrorEntry> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  /**
   * Create a new ErrorOutbox instance.
   * @param webhookUrl - Discord webhook URL to send error logs to
   * @param log - Pino logger instance for internal logging
   */
  constructor(webhookUrl: string, log: Logger) {
    this.webhookUrl = webhookUrl;
    this.log = log.child({ component: "ErrorOutbox" });
  }

  /**
   * Check if an error should be filtered from Discord logging based on Discord API error codes or system error codes.
   * Errors are filtered if they contain a rawError.code that matches any code in FILTERED_DISCORD_ERROR_CODES,
   * or if they contain an err.code that matches any code in FILTERED_SYSTEM_ERROR_CODES.
   *
   * @param context - Optional context object that may contain error information
   * @returns true if the error should be filtered (not sent to Discord), false otherwise
   */
  private shouldFilterError(context?: Record<string, unknown>): boolean {
    if (!context) {
      return false;
    }

    const rawErrorCode = this.extractDiscordErrorCode(context);
    if (rawErrorCode !== null && FILTERED_DISCORD_ERROR_CODES.includes(rawErrorCode)) {
      return true;
    }

    const systemErrorCode = this.extractSystemErrorCode(context);
    if (systemErrorCode !== null && FILTERED_SYSTEM_ERROR_CODES.includes(systemErrorCode)) {
      return true;
    }

    return false;
  }

  /**
   * Extract Discord API error code from context object.
   * Checks common locations where Discord error codes might appear.
   *
   * @param context - Context object that may contain error information
   * @returns Discord error code if found, null otherwise
   */
  private extractDiscordErrorCode(context: Record<string, unknown>): number | null {
    if (typeof context["rawError"] === "object" && context["rawError"] !== null) {
      const rawError = context["rawError"] as Record<string, unknown>;
      if (typeof rawError["code"] === "number") {
        return rawError["code"];
      }
    }

    if (typeof context["err"] === "object" && context["err"] !== null) {
      const err = context["err"] as Record<string, unknown>;
      if (typeof err["rawError"] === "object" && err["rawError"] !== null) {
        const rawError = err["rawError"] as Record<string, unknown>;
        if (typeof rawError["code"] === "number") {
          return rawError["code"];
        }
      }
    }

    return null;
  }

  /**
   * Extract system error code from context object.
   * Checks common locations where Node.js system error codes might appear (e.g., EAI_AGAIN, ECONNREFUSED).
   *
   * @param context - Context object that may contain error information
   * @returns System error code string if found, null otherwise
   */
  private extractSystemErrorCode(context: Record<string, unknown>): string | null {
    if (typeof context["err"] === "object" && context["err"] !== null) {
      const err = context["err"] as Record<string, unknown>;
      if (typeof err["code"] === "string") {
        return err["code"];
      }
    }

    if (typeof context["code"] === "string") {
      return context["code"];
    }

    return null;
  }

  /**
   * Start the outbox flush interval.
   */
  start(): void {
    if (this.flushInterval) {
      return;
    }

    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        this.log.error({ err }, "Failed to flush error outbox");
      });
    }, FLUSH_INTERVAL_MS);

    this.log.info("Error outbox started");
  }

  /**
   * Stop the outbox flush interval and perform final flush.
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();
    this.log.info("Error outbox stopped");
  }

  /**
   * Add an error to the outbox queue.
   * Errors matching FILTERED_DISCORD_ERROR_CODES will be silently dropped.
   *
   * @param level - Severity level of the log entry ("error" or "warn")
   * @param message - Human-readable error message
   * @param context - Optional additional context data to include with the error
   * @param stack - Optional stack trace string
   */
  add(
    level: "error" | "warn",
    message: string,
    context?: Record<string, unknown>,
    stack?: string,
  ): void {
    if (this.shouldFilterError(context)) {
      return;
    }

    const key = this.generateKey(level, message, context);
    const existing = this.entries.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
    } else {
      const entry: ErrorEntry = {
        level,
        message,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
      };
      if (context !== undefined) {
        entry.context = context;
      }
      if (stack !== undefined) {
        entry.stack = stack;
      }
      this.entries.set(key, entry);
    }
  }

  /**
   * Add a Pino log entry to the outbox queue.
   * Parses Pino's log format to extract message, context, and stack trace.
   *
   * @param obj - First argument passed to Pino logger (may be an object or string)
   * @param args - Additional arguments passed to Pino logger
   */
  addFromPinoLog(obj: unknown, args: unknown[]): void {
    const { message, context, stack } = extractMessageContextStack(obj, args);
    this.add("error", message, context, stack);
  }

  /**
   * Flush all queued errors to Discord webhook.
   */
  async flush(): Promise<void> {
    if (this.entries.size === 0) {
      return;
    }

    const entries = Array.from(this.entries.values());
    const batches = this.createBatches(entries, DISCORD_EMBED_LIMIT);

    const successfulKeys = new Set<string>();

    for (const batch of batches) {
      try {
        await this.sendToDiscord(batch);
        for (const entry of batch) {
          const key = this.generateKey(entry.level, entry.message, entry.context);
          successfulKeys.add(key);
        }
      } catch (err) {
        this.log.error({ err, batchSize: batch.length }, "Failed to send error batch to Discord");
      }
    }

    for (const key of successfulKeys) {
      this.entries.delete(key);
    }
  }

  /**
   * Generate a unique key for deduplication.
   * @param level - Severity level of the log entry
   * @param message - Error message
   * @param context - Optional context data
   * @returns Unique string key for deduplication
   */
  private generateKey(level: string, message: string, context?: Record<string, unknown>): string {
    const contextStr = context ? JSON.stringify(context) : "";
    return `${level}:${message}:${contextStr}`;
  }

  /**
   * Split entries into batches respecting Discord's embed limit.
   * @param entries - Array of error entries to batch
   * @param batchSize - Maximum number of entries per batch
   * @returns Array of batches, each containing up to batchSize entries
   */
  private createBatches(entries: ErrorEntry[], batchSize: number): ErrorEntry[][] {
    const batches: ErrorEntry[][] = [];
    for (let i = 0; i < entries.length; i += batchSize) {
      batches.push(entries.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Send a batch of errors to Discord as embeds.
   * @param entries - Array of error entries to send
   * @throws Error if Discord webhook request fails
   */
  private async sendToDiscord(entries: ErrorEntry[]): Promise<void> {
    const embeds = entries.map((entry) => this.createEmbed(entry));

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ embeds }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook returned ${response.status}: ${text}`);
    }
  }

  /**
   * Create a Discord embed from an error entry.
   * @param entry - Error entry to convert to Discord embed format
   * @returns Discord embed object with title, color, fields, and timestamp
   */
  private createEmbed(entry: ErrorEntry): Record<string, unknown> {
    const countSuffix = entry.count > 1 ? ` (x${entry.count})` : "";
    const title = `${entry.level.toUpperCase()}: ${entry.message}${countSuffix}`;

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = JSON.stringify(entry.context, null, 2);
      fields.push({
        name: "Context",
        value: `\`\`\`json\n${contextStr.slice(0, 1000)}\n\`\`\``,
      });
    }

    if (entry.stack) {
      fields.push({
        name: "Stack Trace",
        value: `\`\`\`\n${entry.stack.slice(0, 1000)}\n\`\`\``,
      });
    }

    return {
      title: title.slice(0, 256),
      fields,
      timestamp: entry.lastSeen.toISOString(),
    };
  }
}
