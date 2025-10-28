import type { Logger } from "pino";
import { FILTERED_DISCORD_ERROR_CODES, FILTERED_SYSTEM_ERROR_CODES } from "./errorFilters.js";

/**
 * Maximum number of Discord embeds that can be sent in a single webhook request.
 */
const DISCORD_EMBED_LIMIT = 10;

/**
 * Interval in milliseconds at which queued messages are flushed to Discord.
 */
const FLUSH_INTERVAL_MS = 5000;

/**
 * Log levels supported by the message outbox.
 */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Priority ordering for log levels (higher number = more severe).
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Discord embed colors for each log level.
 */
const LEVEL_COLORS: Record<LogLevel, number> = {
  debug: 0x9b59b6,
  info: 0x3498db,
  warn: 0xf39c12,
  error: 0xe74c3c,
};

/**
 * Get all log levels at or above the specified minimum level.
 * @param minLevel - The minimum log level
 * @returns Array of log levels at or above the minimum
 */
export function getLevelsAtOrAbove(minLevel: LogLevel): LogLevel[] {
  const minPriority = LOG_LEVEL_PRIORITY[minLevel];
  return (Object.keys(LOG_LEVEL_PRIORITY) as LogLevel[]).filter(
    (level) => LOG_LEVEL_PRIORITY[level] >= minPriority,
  );
}

/**
 * Internal representation of a queued message with metadata.
 */
interface MessageEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * Extracted data from a Pino log entry.
 */
export interface ExtractedLogData {
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Configuration for routing messages to Discord based on log level and key-value tags.
 * Tags is a Map where keys are context field names and values are arrays of matching values.
 * Example: Map { "component" => ["security"], "category" => ["failure", "error"] }
 */
export interface RoutingConfig {
  levels: LogLevel[];
  tags: Map<string, string[]>;
}

/**
 * Extracts message, context, and stack trace from Pino log arguments.
 * Handles various Pino log formats including string messages, error objects, and structured logs.
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
 * Checks if a log message context matches any of the configured key-value tags.
 * @param context - Log message context object
 * @param tags - Map of keys to arrays of matching values
 * @returns true if any key-value pair in context matches the configured tags
 */
function matchesTags(
  context: Record<string, unknown> | undefined,
  tags: Map<string, string[]>,
): boolean {
  if (!context || tags.size === 0) {
    return false;
  }

  for (const [key, values] of tags.entries()) {
    const contextValue = context[key];
    if (typeof contextValue === "string" && values.includes(contextValue)) {
      return true;
    }
  }

  return false;
}

/**
 * Manages queuing and batching of log messages for delivery to Discord via webhook.
 * Deduplicates identical messages, filters known error codes, and routes messages based on level and category.
 */
export class MessageOutbox {
  private readonly webhookUrl: string;
  private readonly log: Logger;
  private readonly entries: Map<string, MessageEntry> = new Map();
  private readonly routingConfig: RoutingConfig;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    webhookUrl: string,
    log: Logger,
    routingConfig: RoutingConfig = { levels: ["warn", "error"], tags: new Map() },
  ) {
    this.webhookUrl = webhookUrl;
    this.log = log.child({ component: "MessageOutbox" });
    this.routingConfig = routingConfig;
  }

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

  private shouldRoute(level: LogLevel, context?: Record<string, unknown>): boolean {
    if (this.routingConfig.levels.includes(level)) {
      return true;
    }

    return matchesTags(context, this.routingConfig.tags);
  }

  start(): void {
    if (this.flushInterval) {
      return;
    }

    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        this.log.error({ err }, "Failed to flush message outbox");
      });
    }, FLUSH_INTERVAL_MS);

    this.log.info("Message outbox started");
  }

  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();
    this.log.info("Message outbox stopped");
  }

  add(level: LogLevel, message: string, context?: Record<string, unknown>, stack?: string): void {
    if (this.shouldFilterError(context)) {
      return;
    }

    if (!this.shouldRoute(level, context)) {
      return;
    }

    const key = this.generateKey(level, message, context);
    const existing = this.entries.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
    } else {
      const entry: MessageEntry = {
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

  addFromPinoLog(level: LogLevel, obj: unknown, args: unknown[]): void {
    const { message, context, stack } = extractMessageContextStack(obj, args);
    this.add(level, message, context, stack);
  }

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
        this.log.error({ err, batchSize: batch.length }, "Failed to send message batch to Discord");
      }
    }

    for (const key of successfulKeys) {
      this.entries.delete(key);
    }
  }

  private generateKey(level: string, message: string, context?: Record<string, unknown>): string {
    const contextStr = context ? JSON.stringify(context) : "";
    return `${level}:${message}:${contextStr}`;
  }

  private createBatches(entries: MessageEntry[], batchSize: number): MessageEntry[][] {
    const batches: MessageEntry[][] = [];
    for (let i = 0; i < entries.length; i += batchSize) {
      batches.push(entries.slice(i, i + batchSize));
    }
    return batches;
  }

  private async sendToDiscord(entries: MessageEntry[]): Promise<void> {
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

  private createEmbed(entry: MessageEntry): Record<string, unknown> {
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
      color: LEVEL_COLORS[entry.level],
      fields,
      timestamp: entry.lastSeen.toISOString(),
    };
  }
}
