import { existsSync } from "node:fs";
import { resolve } from "node:path";
import fastifyFormBody from "@fastify/formbody";
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
  log: Logger;
}

/**
 * Web server for handling file downloads with captcha verification.
 * Provide endpoints for captcha challenges and verified file downloads.
 */
export class WebServer {
  private readonly app: FastifyInstance;
  private readonly urlSigner: UrlSigner;
  private readonly config: Config;
  private readonly log: Logger;

  constructor(deps: WebServerDependencies) {
    this.config = deps.config;
    this.log = deps.log.child({ component: "WebServer" });
    this.urlSigner = new UrlSigner(deps.config.SIGNING_SECRET);

    this.app = Fastify({
      logger: false,
    });

    this.app.register(fastifyFormBody);
    this.setupErrorHandler();
    this.setupStaticFiles();
    this.setupRoutes(deps);
  }

  /**
   * Set up global error handler to catch unhandled errors.
   * Logs full error details server-side but only returns generic messages for 5xx errors.
   */
  private setupErrorHandler(): void {
    this.app.setErrorHandler((err, _request, reply) => {
      this.log.error(
        {
          err,
          stack: err.stack,
          statusCode: err.statusCode,
        },
        "Unhandled error in request handler",
      );

      const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
      return reply.status(statusCode).send({
        error: statusCode >= 500 ? "Internal server error" : err.message || "Bad request",
      });
    });
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
      log: this.log,
      baseUrl: this.config.WEB_SERVER_BASE_URL,
    });
  }

  /**
   * Start the web server.
   */
  async start(): Promise<void> {
    try {
      await this.app.listen({
        port: this.config.WEB_SERVER_PORT,
        host: this.config.WEB_SERVER_HOST,
      });
      this.log.info(
        {
          port: this.config.WEB_SERVER_PORT,
          host: this.config.WEB_SERVER_HOST,
        },
        "Web server started",
      );
    } catch (err) {
      this.log.error({ err }, "Failed to start web server");
      throw err;
    }
  }

  /**
   * Stop the web server.
   */
  async stop(): Promise<void> {
    try {
      await this.app.close();
      this.log.info("Web server stopped");
    } catch (err) {
      this.log.error({ err }, "Error stopping web server");
      throw err;
    }
  }

  /**
   * Generate a signed download URL for a user and file.
   */
  generateDownloadUrl(userId: string, fileId: string): string {
    return this.urlSigner.signDownloadUrl(
      this.config.WEB_SERVER_BASE_URL,
      userId,
      fileId,
      this.config.URL_EXPIRY_SEC * 1000,
    );
  }

  /**
   * Get the Fastify instance for testing.
   */
  getApp(): FastifyInstance {
    return this.app;
  }
}
