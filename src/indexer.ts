import { stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import glob from "fast-glob";
import Fuse from "fuse.js";
import { lookup } from "mime-types";
import { generateFileId } from "./fileId.js";
import { logger } from "./logger.js";
import { parseQuery } from "./queryParser.js";

/**
 * Default threshold for fuzzy search matching (0-1 scale).
 * Lower values require closer matches, higher values allow more fuzzy matching.
 */
const DEFAULT_MATCH_THRESHOLD = 0.6;

export interface FileMetadata {
  id: string;
  name: string;
  path: string;
  absolutePath: string;
  size: number;
  mtime: Date;
  mimeType: string;
}

export interface SearchResult {
  file: FileMetadata;
  score: number;
}

/**
 * Configuration options for the FileIndexer.
 */
export interface FileIndexerConfig {
  /** Directory to index files from */
  directory: string;
  /** File extensions to include in the index */
  extensions: string[];
  /** Fuzzy search threshold (0-1, higher = more fuzzy) */
  threshold?: number;
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
  private readonly threshold: number;

  constructor(config: FileIndexerConfig) {
    this.directory = config.directory;
    this.extensions = config.extensions;
    this.threshold = config.threshold ?? DEFAULT_MATCH_THRESHOLD;
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
   * Search files by path with support for exact matching via quoted strings.
   * Quoted phrases (e.g., "exact match") are matched literally,
   * while unquoted terms use fuzzy search.
   *
   * @param query - Search query with optional quoted phrases
   * @returns Array of search results sorted by relevance
   *
   * @example
   * search('dragon') // Fuzzy search for 'dragon'
   * search('"dragon.pdf"') // Exact match for 'dragon.pdf' in path
   * search('"patterns/" dragon') // Exact match for 'patterns/' AND fuzzy match for 'dragon'
   */
  search(query: string): SearchResult[] {
    if (!this.fuse || query.trim() === "") {
      return [];
    }

    const parsed = parseQuery(query);
    const allFiles = this.getAll();
    const resultMap = new Map<string, SearchResult>();

    if (parsed.exactPhrases.length > 0) {
      for (const file of allFiles) {
        const matchesAllPhrases = parsed.exactPhrases.every((phrase) =>
          file.path.toLowerCase().includes(phrase.toLowerCase()),
        );

        if (matchesAllPhrases) {
          resultMap.set(file.id, { file, score: 0 });
        }
      }
    }

    if (parsed.fuzzyTerms.length > 0) {
      const fuzzyQuery = parsed.fuzzyTerms.join(" ");
      const fuzzyResults = this.fuse.search(fuzzyQuery);

      for (const result of fuzzyResults) {
        const fileId = result.item.id;
        const score = result.score ?? 0;

        if (parsed.exactPhrases.length > 0) {
          const existingResult = resultMap.get(fileId);
          if (existingResult) {
            existingResult.score = Math.min(existingResult.score + score * 0.1, score);
          }
        } else {
          resultMap.set(fileId, {
            file: result.item,
            score,
          });
        }
      }
    }

    if (parsed.exactPhrases.length > 0 && parsed.fuzzyTerms.length > 0) {
      const exactOnlyIds = new Set<string>();
      for (const [id, result] of resultMap.entries()) {
        if (result.score === 0) {
          const matchesFuzzy = parsed.fuzzyTerms.some((term) =>
            result.file.path.toLowerCase().includes(term.toLowerCase()),
          );
          if (!matchesFuzzy) {
            exactOnlyIds.add(id);
          }
        }
      }

      for (const id of exactOnlyIds) {
        resultMap.delete(id);
      }
    }

    return Array.from(resultMap.values()).sort((a, b) => a.score - b.score);
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
      const name = basename(relativePath);
      const mimeType = lookup(relativePath) || "application/octet-stream";

      const metadata: FileMetadata = {
        id,
        name,
        path: relativePath,
        absolutePath: fullPath,
        size: stats.size,
        mtime: stats.mtime,
        mimeType,
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
    const absoluteDir = resolve(this.directory);
    const patterns = this.extensions.map((ext) => join(absoluteDir, `**/*${ext}`));

    this.watcher = watch(patterns, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on("add", (absolutePath) => {
      const relativePath = relative(absoluteDir, absolutePath);
      this._indexFile(relativePath);
    });

    this.watcher.on("change", (absolutePath) => {
      const relativePath = relative(absoluteDir, absolutePath);
      this._indexFile(relativePath);
    });

    this.watcher.on("unlink", (absolutePath) => {
      const relativePath = relative(absoluteDir, absolutePath);
      this._removeFile(relativePath);
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
      threshold: this.threshold,
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
