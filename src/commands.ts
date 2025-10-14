import { SlashCommandBuilder } from "discord.js";

/**
 * Slash command definitions for the bot.
 * These commands are registered with Discord and available in guilds.
 */
export const commands = [
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for files and get download links")
    .addStringOption((option) =>
      option.setName("query").setDescription("Search term to find files").setRequired(true),
    ),
];
