import { type ChatInputCommandInteraction, Client, Events, GatewayIntentBits } from "discord.js";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import { deployCommands } from "./deployCommands.js";
import { formatSearchResults } from "./format.js";
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
    switch (interaction.commandName) {
      case "search": {
        const query = interaction.options.getString("query", true);
        await this.handleSearch(interaction, query);
        break;
      }
      default: {
        await interaction.reply({
          content: "Unknown command.",
          ephemeral: true,
        });
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
    const userId = interaction.user.id;
    this.logger.info({ userId, query }, "Search command");

    await interaction.deferReply({ ephemeral: true });

    const results = this.indexer.search(query);

    if (results.length === 0) {
      await interaction.editReply({
        content: `No files found matching "${query}".`,
      });
      return;
    }

    const rateLimitResult = await this.rateLimiter.getState(userId);
    if (!rateLimitResult.allowed) {
      const resetTimestamp = Math.floor(rateLimitResult.resetAt.getTime() / 1000);
      await interaction.editReply({
        content: `Sorry, you're out of downloads for now. Your quota will reset <t:${resetTimestamp}:R>.`,
      });
      return;
    }

    const content = formatSearchResults({
      query,
      results,
      userId,
      rateLimitResult,
      urlExpiryMs: this.config.URL_EXPIRY_SEC * 1000,
      generateDownloadUrl: (uid, fid) => this.webServer.generateDownloadUrl(uid, fid),
      maxResults: this.config.MAX_RESULTS,
    });

    await interaction.editReply({ content });
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
