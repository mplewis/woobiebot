import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { validateFilename, validateNoExistingFile } from "../../shared/validation.js";
import { createManageAuthHook } from "../authMiddleware.js";
import { bytesToMB } from "../format.js";
import type { FileIndexer } from "../indexer.js";
import type { UrlSigner } from "../urlSigner.js";

/**
 * Generates a unique filename by appending a numeric suffix if the file already exists.
 * For example: myfile.ext -> myfile_1.ext -> myfile_2.ext
 */
function getUniqueFilename(directory: string, filename: string): string {
  const ext = extname(filename);
  const nameWithoutExt = basename(filename, ext);

  let targetPath = join(directory, filename);
  let counter = 1;

  while (existsSync(targetPath)) {
    const newFilename = `${nameWithoutExt}_${counter}${ext}`;
    targetPath = join(directory, newFilename);
    counter++;
  }

  return basename(targetPath);
}

/**
 * Dependencies required for management routes.
 */
export interface ManageRoutesDependencies {
  urlSigner: UrlSigner;
  indexer: FileIndexer;
  log: Logger;
  baseUrl: string;
  allowedExtensions: readonly string[];
  maxFileSizeMB: number;
}

/**
 * Register file management routes (authenticated operations).
 */
export function registerManageRoutes(app: FastifyInstance, deps: ManageRoutesDependencies): void {
  const { urlSigner, indexer, log, baseUrl, allowedExtensions, maxFileSizeMB } = deps;

  const manageAuthHook = createManageAuthHook(urlSigner, baseUrl, log);

  /**
   * GET /manage
   * Serve file management interface for authorized users.
   */
  app.get("/manage", async (request, reply) => {
    const url = `${baseUrl}${request.url}`;
    const verified = urlSigner.verifyManageUrl(url);

    if (!verified) {
      log.info({ url }, "Invalid or expired manage URL");
      return reply.status(403).send({ error: "Invalid or expired management link" });
    }

    // Serve the pre-processed static HTML file
    // The frontend will read query parameters from window.location.search
    const htmlPath = join(process.cwd(), "dist/public/manage.html");
    const html = readFileSync(htmlPath, "utf-8");

    return reply.type("text/html").send(html);
  });

  /**
   * GET /manage/download/:fileId
   * Direct download for authenticated manage users (bypasses captcha).
   */
  app.get("/manage/download/:fileId", { preHandler: manageAuthHook }, async (request, reply) => {
    const { fileId } = request.params as { fileId: string };

    if (!request.manageAuth) {
      return reply.status(500).send({ error: "Authentication context not set" });
    }

    const { userId } = request.manageAuth;

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
   * DELETE /manage/delete/:fileId
   * Delete a file for authenticated manage users.
   */
  app.delete("/manage/delete/:fileId", { preHandler: manageAuthHook }, async (request, reply) => {
    const { fileId } = request.params as { fileId: string };

    if (!request.manageAuth) {
      return reply.status(500).send({ error: "Authentication context not set" });
    }

    const { userId } = request.manageAuth;
    const deleteLog = log.child({ feature: "manage", operation: "delete", userId, fileId });

    const file = indexer.getById(fileId);
    if (!file) {
      deleteLog.error({}, "Delete failed: file not found");
      return reply.status(404).send({ error: "File not found" });
    }

    if (!existsSync(file.absolutePath)) {
      const errorMessage = "File exists in index but not on disk";
      deleteLog.error({ name: file.name, errorMessage }, "Delete failed due to disk error");
      return reply.status(500).send({ error: "File temporarily unavailable" });
    }

    try {
      const stats = statSync(file.absolutePath);
      const fileSizeMB = bytesToMB(stats.size);
      const directory = dirname(file.absolutePath);
      const filename = basename(file.absolutePath);
      const hiddenPath = join(directory, `.${filename}`);
      const path = file.path.substring(0, file.path.lastIndexOf("/")) || "/";

      await rename(file.absolutePath, hiddenPath);
      deleteLog.info({ name: file.name, fileSizeMB, path }, "File deleted");

      await indexer.rescan();

      return reply.send({ success: true, message: "File deleted successfully" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stats = statSync(file.absolutePath);
      const fileSizeMB = bytesToMB(stats.size);
      const path = file.path.substring(0, file.path.lastIndexOf("/")) || "/";
      deleteLog.error(
        { name: file.name, fileSizeMB, path, errorMessage },
        "Delete failed due to disk error",
      );
      return reply.status(500).send({ error: "Failed to delete file" });
    }
  });

  /**
   * POST /manage/upload
   * Handle file uploads to the managed directory.
   */
  app.post("/manage/upload", async (request, reply) => {
    const fields: Record<string, string> = {};
    let fileData: { filename: string; buffer: Buffer } | null = null;

    try {
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          fileData = { filename: part.filename, buffer };
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }

      request.body = fields;
      await manageAuthHook(request, reply);

      if (reply.sent) {
        return;
      }

      if (!request.manageAuth) {
        return reply.status(500).send({ error: "Authentication context not set" });
      }

      const { userId } = request.manageAuth;
      const uploadLog = log.child({ feature: "manage", operation: "upload", userId });

      if (!fileData) {
        log.info("No file provided in upload request");
        return reply.status(400).send({ error: "No file provided" });
      }

      const { directory: targetDirectory = "" } = fields;

      // Validate file extension
      const fileExtension = fileData.filename
        .substring(fileData.filename.lastIndexOf("."))
        .toLowerCase();
      const normalizedAllowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());

      if (!normalizedAllowedExtensions.includes(fileExtension)) {
        const allowedList = allowedExtensions.join(", ");
        const fileSizeMB = bytesToMB(fileData.buffer.length);
        const path = targetDirectory || "/";
        uploadLog.error(
          { name: fileData.filename, fileSizeMB, path },
          "Upload rejected due to extension not allowed",
        );
        return reply.status(400).send({
          error: `File type ${fileExtension} is not allowed. Allowed types: ${allowedList}`,
        });
      }

      const sanitizedDir = targetDirectory.replace(/\.\./g, "").replace(/^\/+/, "");
      const targetDir = join(indexer["directory"], sanitizedDir);

      await mkdir(targetDir, { recursive: true });

      const uniqueFilename = getUniqueFilename(targetDir, fileData.filename);
      const targetPath = join(targetDir, uniqueFilename);

      await writeFile(targetPath, fileData.buffer);

      const fileSizeMB = bytesToMB(fileData.buffer.length);
      const path = sanitizedDir || "/";
      uploadLog.info({ name: uniqueFilename, fileSizeMB, path }, "File uploaded");

      await indexer.rescan();

      return reply.send({
        success: true,
        message: "File uploaded successfully",
        filename: uniqueFilename,
        path: sanitizedDir ? `${sanitizedDir}/${uniqueFilename}` : uniqueFilename,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (request.manageAuth && fileData) {
        const { userId } = request.manageAuth;
        const uploadLog = log.child({ feature: "manage", operation: "upload", userId });
        const fileSizeMB = bytesToMB(fileData.buffer.length);
        const { directory: targetDirectory = "" } = fields;
        const path = targetDirectory || "/";
        uploadLog.error(
          { name: fileData.filename, fileSizeMB, path, errorMessage },
          "Upload failed due to disk error",
        );
      } else {
        log.error({ err }, "File upload failed");
      }
      return reply.status(500).send({ error: "File upload failed" });
    }
  });

  /**
   * POST /manage/rename
   * Rename or move a file for authenticated manage users.
   */
  app.post("/manage/rename", async (request, reply) => {
    const fields: Record<string, string> = {};

    try {
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === "field") {
          fields[part.fieldname] = part.value as string;
        }
      }

      request.body = fields;
      await manageAuthHook(request, reply);

      if (reply.sent) {
        return;
      }

      if (!request.manageAuth) {
        return reply.status(500).send({ error: "Authentication context not set" });
      }

      const { userId } = request.manageAuth;
      const { fileId, newPath = "", newName } = fields;

      if (!fileId || !newName) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      const renameLog = log.child({ feature: "manage", operation: "rename", userId, fileId });

      // Validate filename
      const validationError = validateFilename(newName, [...allowedExtensions]);
      if (validationError) {
        renameLog.warn({ newName, validationError }, "Rename rejected due to validation error");
        return reply.status(400).send({ error: validationError });
      }

      const file = indexer.getById(fileId);
      if (!file) {
        renameLog.error("File not found");
        return reply.status(404).send({ error: "File not found" });
      }

      const { stat } = await import("node:fs/promises");

      try {
        await stat(file.absolutePath);
      } catch {
        renameLog.error({ path: file.absolutePath }, "File exists in index but not on disk");
        return reply.status(500).send({ error: "File temporarily unavailable" });
      }

      const sanitizedNewPath = newPath.replace(/\.\./g, "").replace(/^\/+/, "");
      const targetDir = join(indexer["directory"], sanitizedNewPath);
      const targetPath = join(targetDir, newName);

      const currentDir = dirname(file.absolutePath);
      const isMove = currentDir !== targetDir;

      await mkdir(targetDir, { recursive: true });

      const { readdir } = await import("node:fs/promises");
      const filesInTargetDir = await readdir(targetDir);
      const existingFileError = validateNoExistingFile(newName, filesInTargetDir);

      if (existingFileError) {
        renameLog.warn({ newName, targetDir }, "Rename rejected due to existing file");
        return reply.status(400).send({ error: existingFileError });
      }

      await rename(file.absolutePath, targetPath);

      const stats = await stat(targetPath);
      const fileSizeMB = bytesToMB(stats.size);
      const oldPath = file.path.substring(0, file.path.lastIndexOf("/")) || "/";
      const newPathDisplay = sanitizedNewPath || "/";

      renameLog.info(
        {
          oldName: file.name,
          newName,
          oldPath,
          newPath: newPathDisplay,
          fileSizeMB,
          operation: isMove ? "move" : "rename",
        },
        isMove ? "File moved" : "File renamed",
      );

      await indexer.rescan();

      return reply.send({
        success: true,
        message: isMove ? "File moved successfully" : "File renamed successfully",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error({ err, errorMessage }, "Rename/move failed");
      return reply.status(500).send({ error: "Failed to rename/move file" });
    }
  });

  /**
   * GET /api/manage
   * Provide manage page data via API for client-side rendering.
   */
  app.get("/api/manage", { preHandler: manageAuthHook }, async (request, reply) => {
    if (!request.manageAuth) {
      return reply.status(500).send({ error: "Authentication context not set" });
    }

    const { userId } = request.manageAuth;
    const expiresAt = request.manageAuth.expiresAt;
    const query = request.query as Record<string, unknown>;
    const signature = query["signature"] as string;

    const directoryTree = indexer.getDirectoryTree();

    return reply.send({
      userId,
      signature,
      expiresAt,
      directoryTree,
      allowedExtensions,
      maxFileSizeMB,
    });
  });
}
