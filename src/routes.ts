import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { ZodError } from "zod";
import type { CaptchaManager } from "./captcha.js";
import type { FileIndexer } from "./indexer.js";
import type { RateLimiter } from "./rateLimiter.js";
import {
  type DeleteQueryParams,
  DeleteQueryParamsSchema,
  type UploadFormFields,
  UploadFormFieldsSchema,
  type VerifyRequest,
  VerifyRequestSchema,
} from "./shared/types.js";
import { templateLoader } from "./templateLoader.js";
import type { UrlSigner } from "./urlSigner.js";

/**
 * Dependencies required for registering HTTP routes.
 */
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
      log.info({ url }, "Invalid or expired download URL");
      return reply.status(403).send({ error: "Invalid or expired download link" });
    }

    const { userId, fileId, expiresAt } = verified;

    // Check if file exists
    const file = indexer.getById(fileId);
    if (!file) {
      log.info({ fileId, userId }, "File not found");
      return reply.status(404).send({ error: "File not found" });
    }

    // Generate a token for this download session
    const token = Math.random().toString(36).substring(2, 15);

    // Get the signature from the original download URL
    const urlObj = new URL(url);
    const signature = urlObj.searchParams.get("signature") || "";

    // Render captcha page with API parameters in URL
    const html = templateLoader.renderCaptchaPage({
      userId,
      fileId,
      token,
      signature,
      expiresAt: expiresAt.toString(),
    });

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
      log.info({ url }, "Invalid or expired manage URL");
      return reply.status(403).send({ error: "Invalid or expired management link" });
    }

    const { userId, expiresAt } = verified;

    const urlObj = new URL(url);
    const signature = urlObj.searchParams.get("signature") || "";

    // Render manage page with API parameters in URL
    const html = templateLoader.renderManagePage({
      userId,
      signature,
      expiresAt: expiresAt.toString(),
    });

    return reply.type("text/html").send(html);
  });

  /**
   * GET /manage/download/:fileId
   * Direct download for authenticated manage users (bypasses captcha).
   */
  app.get("/manage/download/:fileId", async (request, reply) => {
    const { fileId } = request.params as { fileId: string };
    const url = `${baseUrl}${request.url}`;
    const urlObj = new URL(url);

    const userId = urlObj.searchParams.get("userId");
    const signature = urlObj.searchParams.get("signature");
    const expiresAtStr = urlObj.searchParams.get("expiresAt");

    if (!userId || !signature || !expiresAtStr) {
      log.info({ fileId }, "Missing authentication parameters for manage download");
      return reply.status(400).send({ error: "Missing authentication parameters" });
    }

    const expiresAt = Number.parseInt(expiresAtStr, 10);
    if (Number.isNaN(expiresAt)) {
      log.info({ userId, fileId }, "Invalid expiration timestamp for manage download");
      return reply.status(400).send({ error: "Invalid expiration timestamp" });
    }

    if (Date.now() > expiresAt) {
      log.info({ userId, fileId }, "Expired authentication token for manage download");
      return reply.status(403).send({ error: "Authentication token has expired" });
    }

    const manageUrl = urlSigner.signManageUrl(baseUrl, userId, expiresAt - Date.now());
    const manageUrlObj = new URL(manageUrl);
    const expectedSignature = manageUrlObj.searchParams.get("signature");

    if (signature !== expectedSignature) {
      log.info({ userId, fileId }, "Invalid download signature");
      return reply.status(403).send({ error: "Invalid authentication signature" });
    }

    const file = indexer.getById(fileId);
    if (!file) {
      log.info({ fileId, userId }, "File not found for manage download");
      return reply.status(404).send({ error: "File not found" });
    }

    if (!existsSync(file.absolutePath)) {
      log.error(
        { fileId, path: file.absolutePath },
        "File exists in index but not on disk for manage download",
      );
      return reply.status(500).send({ error: "File temporarily unavailable" });
    }

    log.info({ userId, fileId, filename: file.name }, "Serving manage download");

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
   * DELETE /manage/delete/:fileId
   * Delete a file for authenticated manage users.
   */
  app.delete("/manage/delete/:fileId", async (request, reply) => {
    const { fileId } = request.params as { fileId: string };
    const url = `${baseUrl}${request.url}`;
    const urlObj = new URL(url);

    const queryParams = {
      userId: urlObj.searchParams.get("userId"),
      signature: urlObj.searchParams.get("signature"),
      expiresAt: urlObj.searchParams.get("expiresAt"),
    };

    let validatedParams: DeleteQueryParams;
    try {
      validatedParams = DeleteQueryParamsSchema.parse(queryParams);
    } catch (error) {
      if (error instanceof ZodError) {
        log.info({ fileId, errors: error.issues }, "Invalid delete request parameters");
        return reply.status(400).send({ error: "Invalid request parameters" });
      }
      throw error;
    }

    const { userId, signature, expiresAt: expiresAtStr } = validatedParams;
    const expiresAt = Number.parseInt(expiresAtStr, 10);

    if (Date.now() > expiresAt) {
      log.info({ userId, fileId }, "Expired authentication token for file deletion");
      return reply.status(403).send({ error: "Authentication token has expired" });
    }

    const manageUrl = urlSigner.signManageUrl(baseUrl, userId, expiresAt - Date.now());
    const manageUrlObj = new URL(manageUrl);
    const expectedSignature = manageUrlObj.searchParams.get("signature");

    if (signature !== expectedSignature) {
      log.info({ userId, fileId }, "Invalid delete signature");
      return reply.status(403).send({ error: "Invalid authentication signature" });
    }

    const file = indexer.getById(fileId);
    if (!file) {
      log.info({ fileId, userId }, "File not found for deletion");
      return reply.status(404).send({ error: "File not found" });
    }

    if (!existsSync(file.absolutePath)) {
      log.error({ fileId, path: file.absolutePath }, "File exists in index but not on disk");
      return reply.status(500).send({ error: "File temporarily unavailable" });
    }

    try {
      const directory = dirname(file.absolutePath);
      const filename = basename(file.absolutePath);
      const hiddenPath = join(directory, `.${filename}`);

      await rename(file.absolutePath, hiddenPath);
      log.info(
        { userId, fileId, filename: file.name, oldPath: file.absolutePath, newPath: hiddenPath },
        "File hidden (fake deleted)",
      );

      await indexer.rescan();

      return reply.send({ success: true, message: "File deleted successfully" });
    } catch (error) {
      log.error({ userId, fileId, error }, "Failed to delete file");
      return reply.status(500).send({ error: "Failed to delete file" });
    }
  });

  /**
   * POST /upload
   * Handle file uploads to the managed directory.
   */
  app.post("/upload", async (request, reply) => {
    try {
      const parts = request.parts();
      const fields: Record<string, string> = {};
      let fileData: { filename: string; buffer: Buffer } | null = null;

      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          fileData = { filename: part.filename, buffer };
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }

      if (!fileData) {
        log.info("No file provided in upload request");
        return reply.status(400).send({ error: "No file provided" });
      }

      let validatedFields: UploadFormFields;
      try {
        validatedFields = UploadFormFieldsSchema.parse(fields);
      } catch (error) {
        if (error instanceof ZodError) {
          log.info({ errors: error.issues }, "Invalid upload form fields");
          return reply.status(400).send({ error: "Invalid form data" });
        }
        throw error;
      }

      const {
        userId,
        signature,
        expiresAt: expiresAtStr,
        directory: targetDirectory,
      } = validatedFields;

      log.info(
        {
          userId,
          signature: "present",
          expiresAtStr,
        },
        "Upload request received",
      );

      const expiresAt = Number.parseInt(expiresAtStr, 10);
      if (Number.isNaN(expiresAt)) {
        log.info({ userId }, "Invalid expiration timestamp for file upload");
        return reply.status(400).send({ error: "Invalid expiration timestamp" });
      }

      if (Date.now() > expiresAt) {
        log.info({ userId }, "Expired authentication token for file upload");
        return reply.status(403).send({ error: "Authentication token has expired" });
      }

      const manageUrl = urlSigner.signManageUrl(baseUrl, userId, expiresAt - Date.now());
      const urlObj = new URL(manageUrl);
      const expectedSignature = urlObj.searchParams.get("signature");

      if (signature !== expectedSignature) {
        log.info({ userId }, "Invalid upload signature");
        return reply.status(403).send({ error: "Invalid authentication signature" });
      }

      const sanitizedDir = targetDirectory.replace(/\.\./g, "").replace(/^\/+/, "");
      const targetPath = join(indexer["directory"], sanitizedDir, fileData.filename);
      const targetDir = dirname(targetPath);

      await mkdir(targetDir, { recursive: true });
      await writeFile(targetPath, fileData.buffer);

      log.info(
        { userId, filename: fileData.filename, path: targetPath },
        "File uploaded successfully",
      );

      await indexer.rescan();

      return reply.send({
        success: true,
        message: "File uploaded successfully",
        filename: fileData.filename,
        path: sanitizedDir ? `${sanitizedDir}/${fileData.filename}` : fileData.filename,
      });
    } catch (err) {
      log.error({ err }, "File upload failed");
      return reply.status(500).send({ error: "File upload failed" });
    }
  });

  /**
   * GET /api/captcha-data
   * Provide captcha page data via API for client-side rendering.
   */
  app.get("/api/captcha-data", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const urlObj = new URL(url);

    const userId = urlObj.searchParams.get("userId");
    const fileId = urlObj.searchParams.get("fileId");
    const token = urlObj.searchParams.get("token");
    const sig = urlObj.searchParams.get("sig");
    const expiresAtStr = urlObj.searchParams.get("expiresAt");

    if (!userId || !fileId || !token || !sig || !expiresAtStr) {
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
    const expectedSig = downloadUrlObj.searchParams.get("signature");

    if (sig !== expectedSig) {
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

  /**
   * GET /api/manage-data
   * Provide manage page data via API for client-side rendering.
   */
  app.get("/api/manage-data", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const urlObj = new URL(url);

    const userId = urlObj.searchParams.get("userId");
    const signature = urlObj.searchParams.get("signature");
    const expiresAtStr = urlObj.searchParams.get("expiresAt");

    if (!userId || !signature || !expiresAtStr) {
      log.info({ url }, "Missing required parameters for manage data API");
      return reply.status(400).send({ error: "Missing required parameters" });
    }

    const expiresAt = Number.parseInt(expiresAtStr, 10);
    if (Number.isNaN(expiresAt)) {
      log.info({ userId }, "Invalid expiration timestamp for manage data API");
      return reply.status(400).send({ error: "Invalid expiration timestamp" });
    }

    if (Date.now() > expiresAt) {
      log.info({ userId }, "Expired authentication token for manage data API");
      return reply.status(403).send({ error: "Authentication token has expired" });
    }

    const manageUrl = urlSigner.signManageUrl(baseUrl, userId, expiresAt - Date.now());
    const manageUrlObj = new URL(manageUrl);
    const expectedSignature = manageUrlObj.searchParams.get("signature");

    if (signature !== expectedSignature) {
      log.info({ userId }, "Invalid signature for manage data API");
      return reply.status(403).send({ error: "Invalid authentication signature" });
    }

    const directoryTree = indexer.getDirectoryTree();

    return reply.send({
      userId,
      signature,
      expiresAt,
      directoryTree,
    });
  });

  /**
   * GET /health
   * Health check endpoint.
   */
  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok", timestamp: Date.now() });
  });
}
