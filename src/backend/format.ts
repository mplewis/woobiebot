import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { FileMetadata, SearchResult } from "./indexer.js";
import { pluralize } from "./pluralize.js";
import type { RateLimitResult } from "./rateLimiter.js";

/**
 * Converts bytes to megabytes with 2 decimal places.
 */
export function bytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

/**
 * Maximum length for a Discord message in characters.
 */
const DISCORD_MAX_MESSAGE_LENGTH = 2000;

/**
 * Safety factor for message length to leave room for formatting and edge cases.
 */
const MESSAGE_LENGTH_SAFETY_FACTOR = 0.95;

/**
 * Maximum length for a Discord button custom ID in characters.
 */
const DISCORD_MAX_CUSTOM_ID_LENGTH = 100;

/**
 * Threshold for high relevance results (top group).
 * Results with scores below this fraction of the score range are considered most relevant.
 */
const HIGH_RELEVANCE_THRESHOLD = 0.3;

/**
 * Threshold for medium relevance results (middle group).
 * Results with scores below this fraction of the score range are considered moderately relevant.
 */
const MEDIUM_RELEVANCE_THRESHOLD = 0.6;

/**
 * Partitioned search results grouped by relevance score.
 */
export interface PartitionedResults {
  /** Results with high relevance (low scores) */
  best: SearchResult[];
  /** Results with medium relevance */
  medium: SearchResult[];
  /** Results with low relevance (high scores) */
  worst: SearchResult[];
}

/**
 * Options for formatting search results into a Discord message.
 */
export interface FormatSearchResultsOptions {
  /** The search query string */
  query: string;
  /** Array of search results to format */
  results: SearchResult[];
  /** Discord user ID */
  userId: string;
  /** Rate limit state for the user */
  rateLimitResult: RateLimitResult;
  /** URL expiry time in milliseconds */
  urlExpiryMs: number;
  /** Function to generate download URLs */
  generateDownloadUrl: (userId: string, fileId: string) => string;
}

/**
 * Result of formatting search results, including message content and optional button components.
 */
export interface FormattedSearchResults {
  /** The formatted message content */
  content: string;
  /** Optional array of button components for additional actions */
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

/**
 * Partition search results into three groups based on score thresholds.
 * Groups are determined by HIGH_RELEVANCE_THRESHOLD and MEDIUM_RELEVANCE_THRESHOLD.
 *
 * @param results - Array of search results to partition
 * @returns Partitioned results grouped by relevance
 */
export function partitionResultsByScore(results: SearchResult[]): PartitionedResults {
  const best: SearchResult[] = [];
  const medium: SearchResult[] = [];
  const worst: SearchResult[] = [];

  for (const result of [...results].sort((a, b) => a.file.path.localeCompare(b.file.path))) {
    if (result.score < HIGH_RELEVANCE_THRESHOLD) {
      best.push(result);
    } else if (result.score < MEDIUM_RELEVANCE_THRESHOLD) {
      medium.push(result);
    } else {
      worst.push(result);
    }
  }

  return { best, medium, worst };
}

/**
 * Format search results into a Discord message with download links and quota information.
 * If not all results fit in the message, a "List all" button is added with the query truncated
 * to fit Discord's 100-character custom ID limit.
 *
 * @param options - Configuration for formatting the search results
 * @returns Formatted message object with content and optional button components
 */
export function formatSearchResults(options: FormatSearchResultsOptions): FormattedSearchResults {
  const { query, results, userId, rateLimitResult, urlExpiryMs, generateDownloadUrl } = options;

  const maxLength = Math.floor(DISCORD_MAX_MESSAGE_LENGTH * MESSAGE_LENGTH_SAFETY_FACTOR);
  const sortedResults = [...results].sort((a, b) => a.score - b.score);

  const expiryTimestamp = Math.floor((Date.now() + urlExpiryMs) / 1000);
  const resetTimestamp = Math.floor(rateLimitResult.resetAt.getTime() / 1000);

  const fileWord = pluralize(results.length, "file");
  const found = `Found ${results.length} ${fileWord} matching "${query}"`;
  const expiry = `Links expire <t:${expiryTimestamp}:R>.\n`;
  const downloadWord = pluralize(rateLimitResult.remainingTokens, "download");
  const quota =
    rateLimitResult.remainingTokens > 0
      ? `You have ${rateLimitResult.remainingTokens} ${downloadWord} remaining, refreshing <t:${resetTimestamp}:R>.`
      : `You have no downloads remaining, but you can still search. Downloads reset at <t:${resetTimestamp}:R>.`;

  const header = `${found}:\n\n`;
  const footer = `\n\n${expiry}${quota}`;

  const resultLinks: string[] = [];
  let includedCount = 0;

  for (const result of sortedResults) {
    const downloadUrl = generateDownloadUrl(userId, result.file.id);
    const link = `- [\`${result.file.path}\`](${downloadUrl})`;

    const remaining = results.length - includedCount;
    const moreSuffix = `\n...and ${remaining} more`;
    const linksContent = resultLinks.length > 0 ? `${resultLinks.join("\n")}\n${link}` : link;
    const potentialContent = `${header}${linksContent}${moreSuffix}${footer}`;

    if (potentialContent.length > maxLength) {
      break;
    }

    resultLinks.push(link);
    includedCount++;
  }

  const more =
    includedCount < results.length ? `\n...and ${results.length - includedCount} more` : "";
  const content = `${header}${resultLinks.join("\n")}${more}${footer}`;

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (includedCount < results.length) {
    const customIdPrefix = "list_all:";
    const maxQueryLength = DISCORD_MAX_CUSTOM_ID_LENGTH - customIdPrefix.length;
    const truncatedQuery = query.slice(0, maxQueryLength);

    const button = new ButtonBuilder()
      .setCustomId(`${customIdPrefix}${truncatedQuery}`)
      .setLabel("List all search results")
      .setStyle(ButtonStyle.Secondary);

    components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button));
  }

  return components.length > 0 ? { content, components } : { content };
}

/**
 * Format all search results as a text file attachment.
 * Results are sorted into three groups by score (best, medium, worst),
 * with each group alphabetized by path.
 *
 * @param query - The search query
 * @param results - All search results
 * @returns Object with message content and file attachment
 */
export function formatAllResultsList(
  query: string,
  results: SearchResult[],
): { content: string; files: AttachmentBuilder[] } {
  if (results.length === 0) {
    const attachment = new AttachmentBuilder(Buffer.from("", "utf-8")).setName(
      `search-results-${query}.txt`,
    );
    return {
      content: `All 0 files matching "${query}":`,
      files: [attachment],
    };
  }

  const { best, medium, worst } = partitionResultsByScore(results);

  const headers = ["MOST RELEVANT", "MODERATE RELEVANCE", "LEAST RELEVANT"];
  const groupsWithHeaders = [
    { header: headers[0], items: best },
    { header: headers[1], items: medium },
    { header: headers[2], items: worst },
  ].filter((group) => group.items.length > 0);

  const divider = "========================================";
  const fileContent = groupsWithHeaders
    .map(
      (group) => `${group.header}\n${divider}\n${group.items.map((r) => r.file.path).join("\n")}`,
    )
    .join("\n\n");

  const attachment = new AttachmentBuilder(Buffer.from(fileContent, "utf-8")).setName(
    `search-results-${query}.txt`,
  );

  const fileWord = pluralize(results.length, "file");
  return {
    content: `All ${results.length} ${fileWord} matching "${query}":`,
    files: [attachment],
  };
}

/**
 * Options for formatting list results.
 */
export interface FormatListResultsOptions {
  /** Files to list */
  files: FileMetadata[];
  /** List mode: "all" for alphabetical, or number for recent files */
  mode: "all" | number;
}

/**
 * Result of formatting list results.
 */
export interface FormattedListResults {
  /** The formatted message content (if fits in Discord limit) */
  content?: string;
  /** File attachment (if content too long) */
  files?: AttachmentBuilder[];
}

/**
 * Format a list of files as either a message or attachment.
 * For recent files (mode is number), shows timestamps and sorts by date descending.
 * For all files (mode is "all"), sorts alphabetically with no timestamps.
 *
 * @param options - Configuration for formatting the list
 * @returns Formatted message or attachment
 */
export function formatListResults(options: FormatListResultsOptions): FormattedListResults {
  const { files, mode } = options;

  let sortedFiles: FileMetadata[];
  let showTimestamps = false;
  let description: string;

  if (mode === "all") {
    sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
    description = `All ${files.length} ${pluralize(files.length, "file")}:`;
  } else {
    sortedFiles = [...files].sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).slice(0, mode);
    showTimestamps = true;
    const fileWord = pluralize(sortedFiles.length, "file");
    description =
      mode === 20
        ? `${sortedFiles.length} most recent ${fileWord}:`
        : `${sortedFiles.length} most recent ${fileWord} (of ${files.length} total):`;
  }

  const lines = sortedFiles.map((file) => {
    if (showTimestamps) {
      const timestamp = Math.floor(file.mtime.getTime() / 1000);
      return `- ${file.path}: <t:${timestamp}:R>`;
    }
    return `- ${file.path}`;
  });

  const content = `${description}\n\n${lines.join("\n")}`;

  if (content.length <= DISCORD_MAX_MESSAGE_LENGTH) {
    return { content };
  }

  const fileContent = lines.join("\n");
  const filename = mode === "all" ? "all-files.txt" : `recent-${mode}-files.txt`;
  const attachment = new AttachmentBuilder(Buffer.from(fileContent, "utf-8")).setName(filename);

  return {
    content: description,
    files: [attachment],
  };
}
