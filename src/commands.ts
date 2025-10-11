import { SlashCommandBuilder } from "discord.js";

/**
 * Slash command definitions for the bot.
 * These commands are registered with Discord and available in guilds.
 */
export const commands = [
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for files by name or content")
    .addStringOption((option) =>
      option.setName("query").setDescription("Search term to find files").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("get")
    .setDescription("Get a download link for a file")
    .addStringOption((option) =>
      option.setName("fileid").setDescription("ID of the file to download").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("quota")
    .setDescription("Check your download quota and reset time"),

  new SlashCommandBuilder().setName("help").setDescription("Show available commands and usage"),
];
