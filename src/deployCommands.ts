import { REST, Routes } from "discord.js";
import type { Logger } from "pino";
import { commands } from "./commands.js";

/**
 * Deploy slash commands to Discord.
 * If guildId is set, deploys to that specific guild. Otherwise, deploys globally.
 *
 * @param token - Discord bot token
 * @param clientId - Discord application client ID
 * @param guildId - Optional guild ID for guild-specific deployment
 * @param logger - Logger instance for logging deployment status
 */
export async function deployCommands(
  token: string,
  clientId: string,
  guildId: string | undefined,
  logger: Logger,
): Promise<void> {
  try {
    const commandData = commands.map((command) => command.toJSON());

    logger.info({ commandCount: commandData.length, guildId }, "Deploying slash commands...");

    const rest = new REST({ version: "10" }).setToken(token);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandData,
      });
      logger.info({ guildId }, "Successfully deployed guild commands");
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandData,
      });
      logger.info("Successfully deployed global commands (may take up to 1 hour to propagate)");
    }
  } catch (error) {
    logger.error({ error }, "Failed to deploy commands");
    throw error;
  }
}
