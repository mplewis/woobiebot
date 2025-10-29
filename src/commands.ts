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
  new SlashCommandBuilder()
    .setName("manage")
    .setDescription("Get a link to the file management interface"),
  new SlashCommandBuilder()
    .setName("list")
    .setDescription("List files by date or alphabetically")
    .addStringOption((option) =>
      option
        .setName("count_or_all")
        .setDescription('"all" for all files, or number (e.g. "50") for N recent (default: 20)')
        .setRequired(false),
    ),
];
