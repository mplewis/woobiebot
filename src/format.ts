import type { SearchResult } from "./indexer.js";
import type { RateLimitResult } from "./rateLimiter.js";

/**
 * Options for formatting search results into a Discord message.
 */
export interface FormatSearchResultsOptions {
  query: string;
  results: SearchResult[];
  userId: string;
  rateLimitResult: RateLimitResult;
  urlExpiryMs: number;
  generateDownloadUrl: (userId: string, fileId: string) => string;
  maxResults: number;
}

/**
 * Format search results into a Discord message with download links and quota information.
 *
 * @param options - Configuration for formatting the search results
 * @returns Formatted message string ready to send to Discord
 */
export function formatSearchResults(options: FormatSearchResultsOptions): string {
  const { query, results, userId, rateLimitResult, urlExpiryMs, generateDownloadUrl, maxResults } =
    options;

  const displayed = results.slice(0, maxResults);

  const resultLinks = displayed.map((result) => {
    const downloadUrl = generateDownloadUrl(userId, result.file.id);
    return `• [${result.file.name}](${downloadUrl})`;
  });

  const more = results.length > maxResults ? `\n...and ${results.length - maxResults} more` : "";

  const expiryTimestamp = Math.floor((Date.now() + urlExpiryMs) / 1000);
  const resetTimestamp = Math.floor(rateLimitResult.resetAt.getTime() / 1000);

  const found = `Found ${results.length} file(s) matching "${query}"`;
  const expiry = `Links expire <t:${expiryTimestamp}:R>.\n`;
  const s = rateLimitResult.remainingTokens === 1 ? "" : "s";
  const quota = `You have ${rateLimitResult.remainingTokens} download${s} remaining, refreshing <t:${resetTimestamp}:R>.`;

  return `${found}:\n\n${resultLinks.join("\n")}${more}\n\n${expiry}${quota}`;
}
