import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
  log: Logger;
  baseUrl: string;
}

/**
 * Register all HTTP routes for the web server.
 */
export function registerRoutes(app: FastifyInstance, deps: RoutesDependencies): void {
  const { urlSigner, captchaManager, rateLimiter, indexer, log, baseUrl } = deps;

  /**
   * GET /download
   * Display captcha page for verified download URLs.
   */
  app.get("/download", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const verified = urlSigner.verifyDownloadUrl(url);

    if (!verified) {
      log.warn({ url }, "Invalid or expired download URL");
      return reply.status(403).send({ error: "Invalid or expired download link" });
    }

    const { userId, fileId } = verified;

    // Check if file exists
    const file = indexer.getById(fileId);
    if (!file) {
      log.warn({ fileId, userId }, "File not found");
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
      token: string;
      challenge: string;
      signature: string;
      solution: string;
    };
  }>("/verify", async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { userId, fileId, token, challenge, signature, solution } = body;

    if (!userId || !fileId || !token || !challenge || !signature || !solution) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

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
      log.warn({ userId, fileId }, "Invalid captcha solution");
      return reply.status(403).send({ error: "Invalid captcha solution" });
    }

    // Check rate limit
    const rateLimitResult = await rateLimiter.consume(userId);
    if (!rateLimitResult.allowed) {
      log.warn({ userId, fileId }, "Rate limit exceeded");
      return reply.status(429).send({ error: "Rate limit exceeded. Please try again later." });
    }

    // Get file info
    const file = indexer.getById(fileId);
    if (!file) {
      log.warn({ fileId, userId }, "File not found");
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
    const safeFilename = file.name.replace(/["\\]/g, "\\$&").replace(/[\r\n]/g, "");
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
   * GET /manage
   * Display file management interface for authorized users.
   */
  app.get("/manage", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const verified = urlSigner.verifyManageUrl(url);

    if (!verified) {
      log.warn({ url }, "Invalid or expired manage URL");
      return reply.status(403).send({ error: "Invalid or expired management link" });
    }

    const { userId, expiresAt } = verified;
    const directoryTree = indexer.getDirectoryTree();

    const urlObj = new URL(url);
    const token = urlObj.searchParams.get("userId") || "";
    const signature = urlObj.searchParams.get("signature") || "";

    const html = templateLoader.renderManagePage({
      userId,
      token,
      signature,
      expiresAt,
      directoryTree,
    });

    return reply.type("text/html").send(html);
  });

  /**
   * POST /upload
   * Handle file uploads to the managed directory.
   */
  app.post("/upload", async (request, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const getFieldValue = (fieldName: string): string | undefined => {
        const field = data.fields[fieldName];
        if (!field) {
          return undefined;
        }
        if (Array.isArray(field)) {
          return undefined;
        }
        return field.type === "field" ? (field.value as string) : undefined;
      };

      const userId = getFieldValue("userId");
      const token = getFieldValue("userId");
      const signature = getFieldValue("signature");
      const expiresAtStr = getFieldValue("expiresAt");
      const targetDirectory = getFieldValue("directory") || "";

      if (!userId || !token || !signature || !expiresAtStr) {
        return reply.status(400).send({ error: "Missing authentication data" });
      }

      const expiresAt = Number.parseInt(expiresAtStr, 10);
      if (Number.isNaN(expiresAt)) {
        return reply.status(400).send({ error: "Invalid expiration timestamp" });
      }

      if (Date.now() > expiresAt) {
        return reply.status(403).send({ error: "Authentication token has expired" });
      }

      const manageUrl = urlSigner.signManageUrl(baseUrl, userId, expiresAt - Date.now());
      const urlObj = new URL(manageUrl);
      const expectedSignature = urlObj.searchParams.get("signature");

      if (signature !== expectedSignature) {
        log.warn({ userId }, "Invalid upload signature");
        return reply.status(403).send({ error: "Invalid authentication signature" });
      }

      const buffer = await data.toBuffer();
      const sanitizedDir = targetDirectory.replace(/\.\./g, "").replace(/^\/+/, "");
      const targetPath = join(indexer["directory"], sanitizedDir, data.filename);
      const targetDir = dirname(targetPath);

      await mkdir(targetDir, { recursive: true });
      await writeFile(targetPath, buffer);

      log.info({ userId, filename: data.filename, path: targetPath }, "File uploaded successfully");

      await indexer.rescan();

      return reply.send({
        success: true,
        message: "File uploaded successfully",
        filename: data.filename,
        path: sanitizedDir ? `${sanitizedDir}/${data.filename}` : data.filename,
      });
    } catch (err) {
      log.error({ err }, "File upload failed");
      return reply.status(500).send({ error: "File upload failed" });
    }
  });

  /**
   * GET /health
   * Health check endpoint.
   */
  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", timestamp: Date.now() });
  });
}
