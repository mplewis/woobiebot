import { SlashCommandBuilder } from "discord.js";

/**
 * Slash command definitions for the bot.
 * These commands are registered with Discord and available in guilds.
 */
export const commands = [
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for files in the database")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("The search term to use to find files")
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("quota")
    .setDescription("Check your download quota and reset time"),

  new SlashCommandBuilder().setName("help").setDescription("Show available commands and usage"),
];
