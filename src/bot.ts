import { type ChatInputCommandInteraction, Client, Events, GatewayIntentBits } from "discord.js";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import { deployCommands } from "./deployCommands.js";
import type { FileIndexer } from "./indexer.js";
import type { RateLimiter } from "./rateLimiter.js";
import type { WebServer } from "./webServer.js";

export interface BotDependencies {
  config: Config;
  indexer: FileIndexer;
  rateLimiter: RateLimiter;
  webServer: WebServer;
  logger: Logger;
}

/**
 * Discord bot for file search and download link generation.
 */
export class Bot {
  private readonly client: Client;
  private readonly config: Config;
  private readonly indexer: FileIndexer;
  private readonly rateLimiter: RateLimiter;
  private readonly webServer: WebServer;
  private readonly logger: Logger;

  constructor(deps: BotDependencies) {
    this.config = deps.config;
    this.indexer = deps.indexer;
    this.rateLimiter = deps.rateLimiter;
    this.webServer = deps.webServer;
    this.logger = deps.logger.child({ component: "Bot" });

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    this.setupEventHandlers();
  }

  /**
   * Set up Discord event handlers for ready and interaction events.
   */
  private setupEventHandlers(): void {
    this.client.on(Events.ClientReady, () => {
      this.logger.info({ username: this.client.user?.tag }, "Bot logged in");
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (!interaction.isChatInputCommand()) {
          return;
        }
        await this.handleCommand(interaction);
      } catch (error) {
        this.logger.error({ error }, "Uncaught error in interaction handler");
      }
    });
  }

  /**
   * Handle incoming slash command interactions and route to appropriate command handlers.
   *
   * @param interaction - The slash command interaction to handle
   */
  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;

    try {
      switch (interaction.commandName) {
        case "search": {
          const query = interaction.options.getString("query", true);
          await this.handleSearch(interaction, query);
          break;
        }
        case "get": {
          const fileId = interaction.options.getString("fileid", true);
          await this.handleGet(interaction, userId, fileId);
          break;
        }
        case "quota": {
          await this.handleQuota(interaction, userId);
          break;
        }
        case "help": {
          await this.handleHelp(interaction);
          break;
        }
        default: {
          await interaction.reply({
            content: "Unknown command. Use `/help` to see available commands.",
            ephemeral: true,
          });
        }
      }
    } catch (error) {
      this.logger.error({ error, userId, command: interaction.commandName }, "Command error");
      const content = "An error occurred while processing your command.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true });
      } else {
        await interaction.reply({ content, ephemeral: true });
      }
    }
  }

  /**
   * Handle the search command to find files matching a query.
   *
   * @param interaction - The slash command interaction
   * @param query - Search term to find files
   */
  private async handleSearch(
    interaction: ChatInputCommandInteraction,
    query: string,
  ): Promise<void> {
    this.logger.info({ userId: interaction.user.id, query }, "Search command");

    await interaction.deferReply({ ephemeral: true });

    const results = this.indexer.search(query);

    if (results.length === 0) {
      await interaction.editReply({
        content: `No files found matching "${query}".`,
      });
      return;
    }

    const maxResults = 10;
    const displayed = results.slice(0, maxResults);
    const resultList = displayed
      .map((result) => `• \`${result.file.id}\` - ${result.file.name}`)
      .join("\n");

    const more =
      results.length > maxResults ? `\n\n...and ${results.length - maxResults} more` : "";

    await interaction.editReply({
      content: `Found ${results.length} file(s) matching "${query}":\n\n${resultList}${more}\n\nUse \`/get <id>\` to download a file.`,
    });
  }

  /**
   * Handle the get command to generate a download link for a file.
   *
   * @param interaction - The slash command interaction
   * @param userId - ID of the user requesting the file
   * @param fileId - ID of the file to download
   */
  private async handleGet(
    interaction: ChatInputCommandInteraction,
    userId: string,
    fileId: string,
  ): Promise<void> {
    this.logger.info({ userId, fileId }, "Get command");

    const file = this.indexer.getById(fileId);
    if (!file) {
      await interaction.reply({
        content: `File with ID \`${fileId}\` not found.`,
        ephemeral: true,
      });
      return;
    }

    const rateLimitResult = await this.rateLimiter.getState(userId);
    if (!rateLimitResult.allowed) {
      const resetTimestamp = Math.floor(rateLimitResult.resetAt.getTime() / 1000);
      await interaction.reply({
        content: `Sorry, you're out of downloads. Your quota will reset <t:${resetTimestamp}:R>.`,
        ephemeral: true,
      });
      return;
    }

    const downloadUrl = this.webServer.generateDownloadUrl(userId, fileId);
    const expiryTimestamp = Math.floor((Date.now() + this.config.URL_EXPIRY_SEC * 1000) / 1000);
    const s = rateLimitResult.remainingTokens === 1 ? "" : "s";
    await interaction.reply({
      content:
        `[${file.name}](${downloadUrl})\n` +
        `This link will expire <t:${expiryTimestamp}:R>. ` +
        `You have ${rateLimitResult.remainingTokens} download${s} remaining.`,
      ephemeral: true,
    });
  }

  /**
   * Handle the quota command to display current quota status.
   *
   * @param interaction - The slash command interaction
   * @param userId - ID of the user to check quota for
   */
  private async handleQuota(
    interaction: ChatInputCommandInteraction,
    userId: string,
  ): Promise<void> {
    this.logger.info({ userId }, "Quota command");

    const rateLimitResult = await this.rateLimiter.getState(userId);
    const resetTimestamp = Math.floor(rateLimitResult.resetAt.getTime() / 1000);
    const s = rateLimitResult.remainingTokens === 1 ? "" : "s";

    let content: string;
    if (rateLimitResult.remainingTokens >= this.config.DOWNLOADS_PER_HR) {
      content = `You have **${rateLimitResult.remainingTokens}** download${s} available.`;
    } else if (rateLimitResult.remainingTokens === 0) {
      content = `You have no downloads available.\nYou'll get another download <t:${resetTimestamp}:R>.`;
    } else {
      content =
        `You have **${rateLimitResult.remainingTokens}** download${s} available.\n` +
        `You'll get another download <t:${resetTimestamp}:R>.`;
    }

    await interaction.reply({ content, ephemeral: true });
  }

  /**
   * Handle the help command to display available commands.
   *
   * @param interaction - The slash command interaction
   */
  private async handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      content:
        "**WoobieBot Commands**\n\n" +
        "`/search <term>` - Search for files by name or content\n" +
        "`/get <id>` - Get a download link for a file\n" +
        "`/quota` - Check your download quota and reset time\n" +
        "`/help` - Show this help message",
      ephemeral: true,
    });
  }

  /**
   * Start the Discord bot.
   * Deploys slash commands and logs in to Discord.
   */
  async start(): Promise<void> {
    try {
      await deployCommands(
        this.config.DISCORD_TOKEN,
        this.config.DISCORD_CLIENT_ID,
        this.config.DISCORD_GUILD_ID,
        this.logger,
      );

      await this.client.login(this.config.DISCORD_TOKEN);
      this.logger.info("Bot started");
    } catch (err) {
      this.logger.error({ err }, "Failed to start bot");
      throw err;
    }
  }

  /**
   * Stop the Discord bot.
   */
  async stop(): Promise<void> {
    try {
      this.client.destroy();
      this.logger.info("Bot stopped");
    } catch (err) {
      this.logger.error({ err }, "Error stopping bot");
      throw err;
    }
  }

  /**
   * Get the Discord client instance for testing.
   */
  getClient(): Client {
    return this.client;
  }
}
