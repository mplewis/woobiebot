import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { CaptchaManager } from "./captcha.js";
import type { Config } from "./config.js";
import type { FileIndexer } from "./indexer.js";
import type { RateLimiter } from "./rateLimiter.js";
import { registerRoutes } from "./routes.js";
import { UrlSigner } from "./urlSigner.js";

export interface WebServerDependencies {
  config: Config;
  captchaManager: CaptchaManager;
  rateLimiter: RateLimiter;
  indexer: FileIndexer;
  logger: Logger;
}

/**
 * Web server for handling file downloads with captcha verification.
 * Provides endpoints for captcha challenges and verified file downloads.
 */
export class WebServer {
  private readonly app: FastifyInstance;
  private readonly urlSigner: UrlSigner;
  private readonly config: Config;
  private readonly logger: Logger;

  constructor(deps: WebServerDependencies) {
    this.config = deps.config;
    this.logger = deps.logger.child({ component: "WebServer" });
    this.urlSigner = new UrlSigner(deps.config.URL_SIGNING_SECRET);

    this.app = Fastify({
      logger: false,
    });

    this.setupStaticFiles();
    this.setupRoutes(deps);
  }

  private setupStaticFiles(): void {
    const publicDir = resolve(process.cwd(), "public");
    if (existsSync(publicDir)) {
      this.app.register(fastifyStatic, {
        root: publicDir,
        prefix: "/public/",
      });
    }
  }

  private setupRoutes(deps: WebServerDependencies): void {
    registerRoutes(this.app, {
      urlSigner: this.urlSigner,
      captchaManager: deps.captchaManager,
      rateLimiter: deps.rateLimiter,
      indexer: deps.indexer,
      logger: this.logger,
      baseUrl: this.config.WEB_SERVER_BASE_URL,
    });
  }

  /**
   * Starts the web server.
   */
  async start(): Promise<void> {
    try {
      await this.app.listen({
        port: this.config.WEB_SERVER_PORT,
        host: this.config.WEB_SERVER_HOST,
      });
      this.logger.info(
        {
          port: this.config.WEB_SERVER_PORT,
          host: this.config.WEB_SERVER_HOST,
        },
        "Web server started",
      );
    } catch (err) {
      this.logger.error({ err }, "Failed to start web server");
      throw err;
    }
  }

  /**
   * Stops the web server.
   */
  async stop(): Promise<void> {
    try {
      await this.app.close();
      this.logger.info("Web server stopped");
    } catch (err) {
      this.logger.error({ err }, "Error stopping web server");
      throw err;
    }
  }

  /**
   * Generates a signed download URL for a user and file.
   */
  generateDownloadUrl(userId: string, fileId: string): string {
    return this.urlSigner.signDownloadUrl(
      this.config.WEB_SERVER_BASE_URL,
      userId,
      fileId,
      this.config.URL_EXPIRES_MS,
    );
  }

  /**
   * Gets the Fastify instance for testing.
   */
  getApp(): FastifyInstance {
    return this.app;
  }
}
