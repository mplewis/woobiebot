import { Client, Events, GatewayIntentBits, type Message } from "discord.js";
import type { Logger } from "pino";
import type { Config } from "./config.js";
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
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.setupEventHandlers();
  }

  /**
   * Set up Discord event handlers for ready and message events.
   */
  private setupEventHandlers(): void {
    this.client.on(Events.ClientReady, () => {
      this.logger.info({ username: this.client.user?.tag }, "Bot logged in");
    });

    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });
  }

  /**
   * Handle incoming Discord messages and route to appropriate command handlers.
   */
  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) {
      return;
    }

    // Only respond to DMs
    if (!message.channel.isDMBased()) {
      return;
    }

    const content = message.content.trim();
    const userId = message.author.id;

    // Parse command
    if (content.startsWith("search ")) {
      const query = content.substring(7).trim();
      await this.handleSearch(message, query);
    } else if (content.startsWith("get ")) {
      const fileId = content.substring(4).trim();
      await this.handleGet(message, userId, fileId);
    } else if (content === "help") {
      await this.handleHelp(message);
    } else {
      await message.reply("Unknown command. Use `help` to see available commands.");
    }
  }

  /**
   * Handle the search command to find files matching a query.
   */
  private async handleSearch(message: Message, query: string): Promise<void> {
    if (!query) {
      await message.reply("Please provide a search term. Usage: `search <term>`");
      return;
    }

    this.logger.info({ userId: message.author.id, query }, "Search command");

    const results = this.indexer.search(query);

    if (results.length === 0) {
      await message.reply(`No files found matching "${query}".`);
      return;
    }

    const maxResults = 10;
    const displayed = results.slice(0, maxResults);
    const resultList = displayed
      .map((result) => `• \`${result.file.id}\` - ${result.file.name} (${result.file.mimeType})`)
      .join("\n");

    const more =
      results.length > maxResults ? `\n\n...and ${results.length - maxResults} more` : "";

    await message.reply(
      `Found ${results.length} file(s) matching "${query}":\n\n${resultList}${more}\n\nUse \`get <id>\` to download a file.`,
    );
  }

  /**
   * Handle the get command to generate a download link for a file.
   */
  private async handleGet(message: Message, userId: string, fileId: string): Promise<void> {
    if (!fileId) {
      await message.reply("Please provide a file ID. Usage: `get <id>`");
      return;
    }

    this.logger.info({ userId, fileId }, "Get command");

    // Check if file exists
    const file = this.indexer.getById(fileId);
    if (!file) {
      await message.reply(`File with ID \`${fileId}\` not found.`);
      return;
    }

    // Check rate limit
    const rateLimitResult = this.rateLimiter.consume(userId);
    if (!rateLimitResult.allowed) {
      const resetTime = new Date(rateLimitResult.resetAt).toLocaleString();
      await message.reply(
        `You have exceeded your download limit. Your quota will reset at ${resetTime}.`,
      );
      return;
    }

    // Generate signed download URL
    const downloadUrl = this.webServer.generateDownloadUrl(userId, fileId);

    await message.reply(
      `Download link for **${file.name}**:\n${downloadUrl}\n\n` +
        `This link will expire in ${this.config.URL_EXPIRES_MS / 1000 / 60} minutes.\n` +
        `You have ${rateLimitResult.remainingTokens} download(s) remaining.`,
    );
  }

  /**
   * Handle the help command to display available commands.
   */
  private async handleHelp(message: Message): Promise<void> {
    await message.reply(
      "**Woobiebot Commands**\n\n" +
        "`search <term>` - Search for files by name or content\n" +
        "`get <id>` - Get a download link for a file\n" +
        "`help` - Show this help message",
    );
  }

  /**
   * Start the Discord bot.
   */
  async start(): Promise<void> {
    try {
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
