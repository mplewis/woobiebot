import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { ZodError } from "zod";
import type { CaptchaManager } from "../captcha.js";
import type { FileIndexer } from "../indexer.js";
import type { RateLimiter } from "../rateLimiter.js";
import { type VerifyRequest, VerifyRequestSchema } from "../shared/types.js";
import type { UrlSigner } from "../urlSigner.js";

/**
 * Dependencies required for public download routes.
 */
export interface PublicRoutesDependencies {
  urlSigner: UrlSigner;
  captchaManager: CaptchaManager;
  rateLimiter: RateLimiter;
  indexer: FileIndexer;
  log: Logger;
  baseUrl: string;
}

/**
 * Register public download routes (captcha-protected downloads).
 */
export function registerPublicRoutes(app: FastifyInstance, deps: PublicRoutesDependencies): void {
  const { urlSigner, captchaManager, rateLimiter, indexer, log, baseUrl } = deps;

  /**
   * GET /download
   * Serve captcha page for verified download URLs.
   */
  app.get("/download", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const verified = urlSigner.verifyDownloadUrl(url);

    if (!verified) {
      log.info({ url }, "Invalid or expired download URL");
      return reply.status(403).send({ error: "Invalid or expired download link" });
    }

    const { userId, fileId } = verified;

    // Check if file exists
    const file = indexer.getById(fileId);
    if (!file) {
      log.info({ fileId, userId }, "File not found");
      return reply.status(404).send({ error: "File not found" });
    }

    // Serve the pre-processed static HTML file
    // The frontend will read query parameters from window.location.search
    const htmlPath = join(process.cwd(), "dist/public/captcha.html");
    const html = readFileSync(htmlPath, "utf-8");

    return reply.type("text/html").send(html);
  });

  /**
   * POST /verify
   * Verify captcha solution and stream the requested file.
   */
  app.post("/verify", async (request, reply) => {
    let body: VerifyRequest;
    try {
      body = VerifyRequestSchema.parse(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        log.info({ errors: error.issues }, "Invalid captcha verification request");
        return reply.status(400).send({ error: "Invalid request data" });
      }
      throw error;
    }

    const { userId, fileId, token, challenge, signature, solution } = body;

    // Verify captcha solution
    const isValid = await captchaManager.verifyChallenge(
      token,
      challenge,
      signature,
      solution,
      userId,
      fileId,
    );

    if (!isValid) {
      log.info({ userId, fileId }, "Invalid captcha solution");
      return reply.status(403).send({ error: "Invalid captcha solution" });
    }

    // Check rate limit
    const rateLimitResult = await rateLimiter.consume(userId);
    if (!rateLimitResult.allowed) {
      log.info({ userId, fileId }, "Rate limit exceeded");
      return reply.status(429).send({ error: "Rate limit exceeded. Please try again later." });
    }

    // Get file info
    const file = indexer.getById(fileId);
    if (!file) {
      log.info({ fileId, userId }, "File not found");
      return reply.status(404).send({ error: "File not found" });
    }

    // Check if file exists on disk
    if (!existsSync(file.absolutePath)) {
      log.error({ fileId, path: file.absolutePath }, "File exists in index but not on disk");
      return reply.status(500).send({ error: "File temporarily unavailable" });
    }

    // Stream file to client
    log.info({ userId, fileId, filename: file.name }, "Serving file download");

    const stat = statSync(file.absolutePath);
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.]/g, "");
    const encodedFilename = encodeURIComponent(file.name);

    return reply
      .header("Content-Type", file.mimeType)
      .header("Content-Length", stat.size)
      .header(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
      )
      .send(createReadStream(file.absolutePath));
  });

  /**
   * GET /api/captcha
   * Provide captcha page data via API for client-side rendering.
   */
  app.get("/api/captcha", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const urlObj = new URL(url);

    const userId = urlObj.searchParams.get("userId");
    const fileId = urlObj.searchParams.get("fileId");
    const signature = urlObj.searchParams.get("signature");
    const expiresAtStr = urlObj.searchParams.get("expiresAt");

    if (!userId || !fileId || !signature || !expiresAtStr) {
      log.info({ url }, "Missing required parameters for captcha data API");
      return reply.status(400).send({ error: "Missing required parameters" });
    }

    const expiresAt = Number.parseInt(expiresAtStr, 10);
    if (Number.isNaN(expiresAt)) {
      log.info({ userId }, "Invalid expiration timestamp for captcha data API");
      return reply.status(400).send({ error: "Invalid expiration timestamp" });
    }

    if (Date.now() > expiresAt) {
      log.info({ userId, fileId }, "Expired authentication token for captcha data API");
      return reply.status(403).send({ error: "Authentication token has expired" });
    }

    const downloadUrl = urlSigner.signDownloadUrl(baseUrl, userId, fileId, expiresAt - Date.now());
    const downloadUrlObj = new URL(downloadUrl);
    const expectedSignature = downloadUrlObj.searchParams.get("signature");

    if (signature !== expectedSignature) {
      log.info({ url }, "Invalid signature for captcha data API");
      return reply.status(403).send({ error: "Invalid signature" });
    }

    const file = indexer.getById(fileId);
    if (!file) {
      log.info({ fileId, userId }, "File not found for captcha data API");
      return reply.status(404).send({ error: "File not found" });
    }

    const challengeData = await captchaManager.generateChallenge(userId, fileId);

    return reply.send({
      challenge: challengeData.challenge,
      token: challengeData.token,
      signature: challengeData.signature,
      userId,
      fileId,
    });
  });
}
