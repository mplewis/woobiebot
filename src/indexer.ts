import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import { glob } from "fast-glob";
import Fuse from "fuse.js";
import { generateFileId } from "./fileId.js";
import { logger } from "./logger.js";

export interface FileMetadata {
  id: string;
  path: string;
  size: number;
  mtime: Date;
}

export interface SearchResult {
  file: FileMetadata;
  score: number;
}

/**
 * Automatically index files from a directory with file watching and fuzzy search.
 * Maintain an in-memory index that stays synchronized with the filesystem.
 */
export class FileIndexer {
  private index: Map<string, FileMetadata> = new Map();
  private watcher: FSWatcher | null = null;
  private fuse: Fuse<FileMetadata> | null = null;
  private readonly directory: string;
  private readonly extensions: string[];

  constructor(directory: string, extensions: string[]) {
    this.directory = directory;
    this.extensions = extensions;
  }

  /**
   * Start the indexer: scan directory and set up file watcher.
   */
  async start(): Promise<void> {
    logger.info(
      { directory: this.directory, extensions: this.extensions },
      "Starting file indexer",
    );
    await this._scanDirectory();
    this._setupWatcher();
    this._initializeSearch();
    logger.info({ fileCount: this.index.size }, "File indexer started");
  }

  /**
   * Stop the file watcher.
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info("File indexer stopped");
    }
  }

  /**
   * Return all indexed files.
   */
  getAll(): FileMetadata[] {
    return Array.from(this.index.values());
  }

  /**
   * Return file metadata by ID.
   */
  getById(id: string): FileMetadata | undefined {
    return this.index.get(id);
  }

  /**
   * Fuzzy search files by path.
   */
  search(query: string): SearchResult[] {
    if (!this.fuse || query.trim() === "") {
      return [];
    }

    const results = this.fuse.search(query);
    return results.map((result) => ({
      file: result.item,
      score: result.score ?? 0,
    }));
  }

  /**
   * Scan the directory and build the initial index.
   */
  private async _scanDirectory(): Promise<void> {
    const patterns = this.extensions.map((ext) => `**/*${ext}`);
    const files = await glob(patterns, {
      cwd: this.directory,
      absolute: false,
      onlyFiles: true,
    });

    for (const file of files) {
      await this._indexFile(file);
    }
  }

  /**
   * Index a single file.
   */
  private async _indexFile(relativePath: string): Promise<void> {
    const fullPath = join(this.directory, relativePath);

    try {
      const stats = await stat(fullPath);
      const id = generateFileId(relativePath);

      const metadata: FileMetadata = {
        id,
        path: relativePath,
        size: stats.size,
        mtime: stats.mtime,
      };

      this.index.set(id, metadata);
      this._updateSearch();

      logger.debug({ id, path: relativePath }, "Indexed file");
    } catch (error) {
      logger.warn({ path: relativePath, error }, "Failed to index file");
    }
  }

  /**
   * Remove a file from the index.
   */
  private _removeFile(relativePath: string): void {
    const id = generateFileId(relativePath);
    if (this.index.delete(id)) {
      this._updateSearch();
      logger.debug({ id, path: relativePath }, "Removed file from index");
    }
  }

  /**
   * Set up the file watcher.
   */
  private _setupWatcher(): void {
    const patterns = this.extensions.map((ext) => `**/*${ext}`);

    this.watcher = watch(patterns, {
      cwd: this.directory,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on("add", (path) => {
      this._indexFile(path);
    });

    this.watcher.on("change", (path) => {
      this._indexFile(path);
    });

    this.watcher.on("unlink", (path) => {
      this._removeFile(path);
    });

    this.watcher.on("error", (error) => {
      logger.error({ error }, "File watcher error");
    });
  }

  /**
   * Initialize the Fuse.js search engine.
   */
  private _initializeSearch(): void {
    this.fuse = new Fuse(this.getAll(), {
      keys: ["path"],
      threshold: 0.4,
      includeScore: true,
    });
  }

  /**
   * Update the search index when files change.
   */
  private _updateSearch(): void {
    if (this.fuse) {
      this.fuse.setCollection(this.getAll());
    }
  }
}
