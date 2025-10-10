import { createReadStream, existsSync, statSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { CaptchaManager } from "./captcha.js";
import type { FileIndexer } from "./indexer.js";
import type { RateLimiter } from "./rateLimiter.js";
import { templateLoader } from "./templateLoader.js";
import type { UrlSigner } from "./urlSigner.js";

export interface RoutesDependencies {
  urlSigner: UrlSigner;
  captchaManager: CaptchaManager;
  rateLimiter: RateLimiter;
  indexer: FileIndexer;
  logger: Logger;
  baseUrl: string;
}

/**
 * Register all HTTP routes for the web server.
 */
export function registerRoutes(app: FastifyInstance, deps: RoutesDependencies): void {
  const { urlSigner, captchaManager, rateLimiter, indexer, logger, baseUrl } = deps;

  /**
   * GET /download
   * Display captcha page for verified download URLs.
   */
  app.get("/download", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const verified = urlSigner.verifyDownloadUrl(url);

    if (!verified) {
      logger.warn({ url }, "Invalid or expired download URL");
      return reply.status(403).send({ error: "Invalid or expired download link" });
    }

    const { userId, fileId } = verified;

    // Check if file exists
    const file = indexer.getById(fileId);
    if (!file) {
      logger.warn({ fileId, userId }, "File not found");
      return reply.status(404).send({ error: "File not found" });
    }

    // Generate captcha challenge
    const challengeData = await captchaManager.generateChallenge(userId, fileId);

    // Render captcha page
    const html = templateLoader.renderCaptchaPage({
      challenge: challengeData.challenge,
      token: challengeData.token,
      signature: challengeData.signature,
      userId,
      fileId,
    });

    return reply.type("text/html").send(html);
  });

  /**
   * POST /verify
   * Verify captcha solution and stream the requested file.
   */
  app.post<{
    Body: {
      userId: string;
      fileId: string;
      challenge: string;
      signature: string;
      solution: string;
    };
  }>("/verify", async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { userId, fileId, challenge, signature, solution } = body;

    if (!userId || !fileId || !challenge || !signature || !solution) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    // Verify captcha solution
    const isValid = await captchaManager.verifyChallenge(
      challenge,
      signature,
      solution,
      userId,
      fileId,
    );

    if (!isValid) {
      logger.warn({ userId, fileId }, "Invalid captcha solution");
      return reply.status(403).send({ error: "Invalid captcha solution" });
    }

    // Check rate limit
    const rateLimitResult = rateLimiter.consume(userId);
    if (!rateLimitResult.allowed) {
      logger.warn({ userId, fileId }, "Rate limit exceeded");
      return reply.status(429).send({ error: "Rate limit exceeded. Please try again later." });
    }

    // Get file info
    const file = indexer.getById(fileId);
    if (!file) {
      logger.warn({ fileId, userId }, "File not found");
      return reply.status(404).send({ error: "File not found" });
    }

    // Check if file exists on disk
    if (!existsSync(file.absolutePath)) {
      logger.error({ fileId, path: file.absolutePath }, "File exists in index but not on disk");
      return reply.status(500).send({ error: "File temporarily unavailable" });
    }

    // Stream file to client
    logger.info({ userId, fileId, filename: file.name }, "Serving file download");

    const stat = statSync(file.absolutePath);
    return reply
      .header("Content-Type", file.mimeType)
      .header("Content-Length", stat.size)
      .header("Content-Disposition", `attachment; filename="${file.name}"`)
      .send(createReadStream(file.absolutePath));
  });

  /**
   * GET /health
   * Health check endpoint.
   */
  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", timestamp: Date.now() });
  });
}
