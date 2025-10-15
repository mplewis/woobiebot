import {
  ActionRowBuilder,
  AttachmentBuilder,
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
  const { query, results, userId, rateLimitResult, urlExpiryMs, generateDownloadUrl } = options;

  const maxLength = Math.floor(DISCORD_MAX_MESSAGE_LENGTH * MESSAGE_LENGTH_SAFETY_FACTOR);
  const sortedResults = [...results].sort((a, b) => a.file.path.localeCompare(b.file.path));

  const expiryTimestamp = Math.floor((Date.now() + urlExpiryMs) / 1000);
  const resetTimestamp = Math.floor(rateLimitResult.resetAt.getTime() / 1000);

  const found = `Found ${results.length} file(s) matching "${query}"`;
  const expiry = `Links expire <t:${expiryTimestamp}:R>.\n`;
  const s = rateLimitResult.remainingTokens === 1 ? "" : "s";
  const quota = `You have ${rateLimitResult.remainingTokens} download${s} remaining, refreshing <t:${resetTimestamp}:R>.`;

  const header = `${found}:\n\n`;
  const footer = `\n\n${expiry}${quota}`;

  const resultLinks: string[] = [];
  let includedCount = 0;

  for (const result of sortedResults) {
    const downloadUrl = generateDownloadUrl(userId, result.file.id);
    const link = `- [${result.file.path}](${downloadUrl})`;

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
    const button = new ButtonBuilder()
      .setCustomId(`list_all:${query}`)
      .setLabel("List all search results")
      .setStyle(ButtonStyle.Secondary);

    components.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(button));
  }

  return components.length > 0 ? { content, components } : { content };
}

/**
 * Format all search results as a text file attachment.
 *
 * @param query - The search query
 * @param results - All search results
 * @returns Object with message content and file attachment
 */
export function formatAllResultsList(
  query: string,
  results: SearchResult[],
): { content: string; files: AttachmentBuilder[] } {
  const sortedResults = [...results].sort((a, b) => a.file.path.localeCompare(b.file.path));

  const fileContent = sortedResults.map((result) => result.file.path).join("\n");

  const attachment = new AttachmentBuilder(Buffer.from(fileContent, "utf-8")).setName(
    `search-results-${query}.txt`,
  );

  return {
    content: `All ${results.length} file(s) matching "${query}":`,
    files: [attachment],
  };
}
