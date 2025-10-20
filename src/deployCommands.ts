import { REST, Routes } from "discord.js";
import type { Logger } from "pino";
import { commands } from "./commands.js";

/**
 * Deploy slash commands to Discord.
 * Always deploys globally, and also deploys to any specified guild IDs for instant availability.
 *
 * @param token - Discord bot token
 * @param clientId - Discord application client ID
 * @param guildIds - Optional array of guild IDs for instant guild-specific deployment
 * @param logger - Logger instance for logging deployment status
 */
export async function deployCommands(
  token: string,
  clientId: string,
  guildIds: string[],
  logger: Logger,
): Promise<void> {
  try {
    const commandData = commands.map((command) => command.toJSON());

    logger.info({ commandCount: commandData.length, guildIds }, "Deploying slash commands...");

    const rest = new REST({ version: "10" }).setToken(token);

    await rest.put(Routes.applicationCommands(clientId), {
      body: commandData,
    });
    logger.info("Successfully deployed global commands (may take up to 1 hour to propagate)");

    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandData,
      });
      logger.info({ guildId }, "Successfully deployed guild commands");
    }
  } catch (err) {
    logger.error({ err }, "Failed to deploy commands");
    throw err;
  }
}
