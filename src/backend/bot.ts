import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import { deployCommands } from "./deployCommands.js";
import { formatAllResultsList, formatListResults, formatSearchResults } from "./format.js";
import type { FileIndexer } from "./indexer.js";
import { pluralize } from "./pluralize.js";
import type { RateLimiter } from "./rateLimiter.js";
import type { WebServer } from "./webServer.js";

/**
 * Help text displayed when users run the /help command.
 * Documents all available Discord slash commands and their usage.
 */
const HELP_TEXT = `
\`/search <query>\`: Search for files and get download links
- \`/search pusheen\`: Searches for files with "pusheen" in the name

\`/list [count_or_all]\`: List most recent files
- \`/list\`: Lists 20 most recent files
- \`/list 50\`: Lists 50 most recent files
- \`/list all\`: Lists all files

\`/manage\`: Get a link to the file management interface
- Link expires after 1 hour
`.trim();

/**
 * Dependencies for the Bot.
 */
export interface BotDependencies {
  /** Application configuration */
  config: Config;
  /** File indexer for searching files */
  indexer: FileIndexer;
  /** Rate limiter for download quotas */
  rateLimiter: RateLimiter;
  /** Web server for serving files */
  webServer: WebServer;
  /** Logger instance */
  log: Logger;
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
  private readonly log: Logger;

  constructor(deps: BotDependencies) {
    this.config = deps.config;
    this.indexer = deps.indexer;
    this.rateLimiter = deps.rateLimiter;
    this.webServer = deps.webServer;
    this.log = deps.log.child({ component: "Bot" });

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
      this.log.info({ username: this.client.user?.tag }, "Bot logged in");
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButton(interaction);
        }
      } catch (err) {
        this.log.error({ err }, "Uncaught error in interaction handler");
      }
    });
  }

  /**
   * Handle incoming slash command interactions and route to appropriate command handlers.
   *
   * @param interaction - The slash command interaction to handle
   */
  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    switch (interaction.commandName) {
      case "search": {
        const query = interaction.options.getString("query", true);
        await this.handleSearch(interaction, query);
        break;
      }
      case "manage": {
        await this.handleManage(interaction);
        break;
      }
      case "list": {
        const mode = interaction.options.getString("count_or_all");
        await this.handleList(interaction, mode);
        break;
      }
      case "help": {
        await this.handleHelp(interaction);
        break;
      }
      default: {
        await interaction.editReply({ content: "Unknown command." });
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
    this.log.info({ userId, query }, "Search command");

    if (query.length < this.config.SEARCH_MIN_CHARS) {
      const word = pluralize(this.config.SEARCH_MIN_CHARS, "character");
      await interaction.editReply({
        content: `Search query must be at least ${this.config.SEARCH_MIN_CHARS} ${word}.`,
      });
      return;
    }

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

    const formatted = formatSearchResults({
      query,
      results,
      userId,
      rateLimitResult,
      urlExpiryMs: this.config.URL_EXPIRY_SEC * 1000,
      generateDownloadUrl: (uid, fid) => this.webServer.generateDownloadUrl(uid, fid),
    });

    await interaction.editReply(formatted);
  }

  /**
   * Handle the manage command to generate a file management URL.
   *
   * @param interaction - The slash command interaction
   */
  private async handleManage(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    this.log.info({ userId }, "Manage command");

    const manageUrl = this.webServer.generateManageUrl(userId);
    const expiryTimestamp = Math.floor(
      (Date.now() + this.config.MANAGE_URL_EXPIRY_SEC * 1000) / 1000,
    );

    await interaction.editReply({
      content: `[Click here to manage files.](${manageUrl})\n\nThis link expires <t:${expiryTimestamp}:R>.`,
    });
  }

  /**
   * Handle the list command to list files by date or alphabetically.
   *
   * @param interaction - The slash command interaction
   * @param mode - List mode: "all" for all files, or number string for N recent files
   */
  private async handleList(
    interaction: ChatInputCommandInteraction,
    mode: string | null,
  ): Promise<void> {
    const userId = interaction.user.id;
    this.log.info({ userId, mode }, "List command");

    const allFiles = this.indexer.getAll();

    if (allFiles.length === 0) {
      await interaction.editReply({
        content: "No files found.",
      });
      return;
    }

    let parsedMode: "all" | number;
    if (mode === "all") {
      parsedMode = "all";
    } else if (mode) {
      const num = Number.parseInt(mode, 10);
      if (Number.isNaN(num) || num <= 0) {
        await interaction.editReply({
          content: 'Invalid mode. Use "all" or a positive number (e.g., "50").',
        });
        return;
      }
      parsedMode = num;
    } else {
      parsedMode = 20;
    }

    const formatted = formatListResults({
      files: allFiles,
      mode: parsedMode,
    });

    await interaction.editReply(formatted);
  }

  /**
   * Handle the help command to show information about available commands.
   *
   * @param interaction - The slash command interaction
   */
  private async handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    this.log.info({ userId }, "Help command");

    await interaction.editReply({ content: HELP_TEXT });
  }

  /**
   * Handle button interactions for listing all search results.
   *
   * @param interaction - The button interaction
   */
  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const userId = interaction.user.id;

    if (!interaction.customId.startsWith("list_all:")) {
      this.log.warn({ userId, customId: interaction.customId }, "Unknown button interaction");
      await interaction.editReply({ content: "Unknown button interaction." });
      return;
    }
    const query = interaction.customId.slice("list_all:".length);
    this.log.info({ userId, query }, "List all results button");

    const results = this.indexer.search(query);
    if (results.length === 0) {
      await interaction.editReply({ content: `No files found matching "${query}".` });
      return;
    }

    const response = formatAllResultsList(query, results);
    await interaction.editReply(response);
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
        this.config.DISCORD_GUILD_IDS,
        this.log,
      );

      await this.client.login(this.config.DISCORD_TOKEN);
      this.log.info("Bot started");
    } catch (err) {
      this.log.error({ err }, "Failed to start bot");
      throw err;
    }
  }

  /**
   * Stop the Discord bot.
   */
  async stop(): Promise<void> {
    try {
      this.client.destroy();
      this.log.info("Bot stopped");
    } catch (err) {
      this.log.error({ err }, "Error stopping bot");
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
