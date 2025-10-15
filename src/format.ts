import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { SearchResult } from "./indexer.js";
import type { RateLimitResult } from "./rateLimiter.js";

/**
 * Maximum length for a Discord message in characters.
 */
const DISCORD_MAX_MESSAGE_LENGTH = 2000;

/**
 * Safety factor for message length to leave room for formatting and edge cases.
 */
const MESSAGE_LENGTH_SAFETY_FACTOR = 0.95;

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
  /** Maximum number of results to display with URLs */
  maxResults: number;
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
 * Format search results into a Discord message with download links and quota information.
 *
 * @param options - Configuration for formatting the search results
 * @returns Formatted message object with content and optional button components
 */
export function formatSearchResults(options: FormatSearchResultsOptions): FormattedSearchResults {
  const { query, results, userId, rateLimitResult, urlExpiryMs, generateDownloadUrl, maxResults } =
    options;

  const displayed = results.slice(0, maxResults);

  const resultLinks = displayed.map((result) => {
    const downloadUrl = generateDownloadUrl(userId, result.file.id);
    return `- [${result.file.name}](${downloadUrl})`;
  });

  const more = results.length > maxResults ? `\n...and ${results.length - maxResults} more` : "";

  const expiryTimestamp = Math.floor((Date.now() + urlExpiryMs) / 1000);
  const resetTimestamp = Math.floor(rateLimitResult.resetAt.getTime() / 1000);

  const found = `Found ${results.length} file(s) matching "${query}"`;
  const expiry = `Links expire <t:${expiryTimestamp}:R>.\n`;
  const s = rateLimitResult.remainingTokens === 1 ? "" : "s";
  const quota = `You have ${rateLimitResult.remainingTokens} download${s} remaining, refreshing <t:${resetTimestamp}:R>.`;

  const content = `${found}:\n\n${resultLinks.join("\n")}${more}\n\n${expiry}${quota}`;

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (results.length > maxResults) {
    const button = new ButtonBuilder()
      .setCustomId(`list_all:${query}`)
      .setLabel("List all search results")
      .setStyle(ButtonStyle.Secondary);

    components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button));
  }

  return components.length > 0 ? { content, components } : { content };
}

/**
 * Format all search results as a simple list of filenames without URLs.
 *
 * @param query - The search query
 * @param results - All search results
 * @returns Formatted message with all filenames
 */
export function formatAllResultsList(query: string, results: SearchResult[]): string {
  const maxLength = Math.floor(DISCORD_MAX_MESSAGE_LENGTH * MESSAGE_LENGTH_SAFETY_FACTOR);
  const found = `All ${results.length} file(s) matching "${query}"`;
  const header = `${found}:\n\n`;

  let content = header;
  let includedCount = 0;

  for (const result of results) {
    const line = `- ${result.file.name}\n`;
    const remaining = results.length - includedCount;
    const truncationSuffix = `\n...and ${remaining} more`;
    const potentialLength = content.length + line.length + truncationSuffix.length;

    if (potentialLength > maxLength) {
      break;
    }

    content += line;
    includedCount++;
  }

  if (includedCount < results.length) {
    const remaining = results.length - includedCount;
    content = content.trimEnd();
    content += `\n...and ${remaining} more`;
  } else {
    content = content.trimEnd();
  }

  return content;
}
