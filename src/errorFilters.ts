/**
 * Discord API error codes that should be filtered from Discord logging.
 *
 * These errors will still appear in local logs but will not be sent to the Discord webhook.
 * This is useful for filtering out common, expected errors that would otherwise spam the Discord channel.
 *
 * Full list: https://discord.com/developers/docs/topics/opcodes-and-status-codes#json
 */
export const FILTERED_DISCORD_ERROR_CODES = [
  10062, // Unknown interaction - occurs when interaction token expires
];

/**
 * System error codes that should be filtered from Discord logging.
 *
 * These are Node.js system-level errors that are expected and transient.
 */
export const FILTERED_SYSTEM_ERROR_CODES = [
  "EAI_AGAIN", // DNS lookup failed temporarily - common network issue
];
