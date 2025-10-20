import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import glob from "fast-glob";
import Fuse from "fuse.js";
import { lookup } from "mime-types";
import { generateFileId } from "./fileId.js";
import { log } from "./logger.js";
import { parseQuery } from "./queryParser.js";

/**
 * Default threshold for fuzzy search matching (0-1 scale).
 * Lower values require closer matches, higher values allow more fuzzy matching.
 */
const DEFAULT_MATCH_THRESHOLD = 0.6;

/**
 * Metadata for an indexed file.
 */
export interface FileMetadata {
  id: string;
  name: string;
  path: string;
  absolutePath: string;
  size: number;
  mtime: Date;
  mimeType: string;
}

/**
 * Search result containing a file and its relevance score.
 */
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
  /** Interval in minutes to rescan the directory (0 to disable) */
  scanIntervalMins?: number;
}

/**
 * Index files from a directory and provide fuzzy search functionality.
 * Optionally rescans the directory at a configurable interval.
 */
export class FileIndexer {
  private index: Map<string, FileMetadata> = new Map();
  private fuse: Fuse<FileMetadata> | null = null;
  private scanInterval: NodeJS.Timeout | null = null;
  private readonly directory: string;
  private readonly extensions: string[];
  private readonly threshold: number;
  private readonly scanIntervalMins: number;

  constructor(config: FileIndexerConfig) {
    this.directory = config.directory;
    this.extensions = config.extensions;
    this.threshold = config.threshold ?? DEFAULT_MATCH_THRESHOLD;
    this.scanIntervalMins = config.scanIntervalMins ?? 0;
  }

  /**
   * Start the indexer: scan directory, initialize search, and set up periodic rescanning.
   */
  async start(): Promise<void> {
    log.info({ directory: this.directory, extensions: this.extensions }, "Starting file indexer");
    await this._scanDirectory();
    this._initializeSearch();

    if (this.scanIntervalMins > 0) {
      this._setupPeriodicScanning();
    }
    log.info({ fileCount: this.index.size }, "File indexer started");
  }

  /**
   * Stop the indexer and clear any periodic scanning.
   */
  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      log.info("File indexer stopped");
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
   * Set up periodic directory rescanning.
   */
  private _setupPeriodicScanning(): void {
    const intervalMs = this.scanIntervalMins * 60 * 1000;
    this.scanInterval = setInterval(() => {
      log.info({ directory: this.directory }, "Rescanning directory");
      this._scanDirectory()
        .then(() => {
          this._updateSearch();
          log.info({ fileCount: this.index.size }, "Rescan complete");
        })
        .catch((err) => {
          log.error({ err }, "Error during rescan");
        });
    }, intervalMs);
  }

  /**
   * Scan the directory and rebuild the index from scratch.
   * Builds a new index separately and atomically replaces the old one to avoid race conditions.
   */
  private async _scanDirectory(): Promise<void> {
    const patterns = this.extensions.map((ext) => `**/*${ext}`);
    const files = await glob(patterns, {
      cwd: this.directory,
      absolute: false,
      onlyFiles: true,
    });

    const newIndex = new Map<string, FileMetadata>();

    for (const file of files) {
      const metadata = await this._buildFileMetadata(file);
      if (metadata) {
        newIndex.set(metadata.id, metadata);
      }
    }

    this.index = newIndex;
  }

  /**
   * Build metadata for a single file.
   * Returns null if the file cannot be indexed.
   */
  private async _buildFileMetadata(relativePath: string): Promise<FileMetadata | null> {
    const fullPath = join(this.directory, relativePath);

    try {
      const stats = await stat(fullPath);
      const id = generateFileId(relativePath);
      const name = basename(relativePath);
      const mimeType = lookup(relativePath) || "application/octet-stream";

      log.debug({ id, path: relativePath }, "Indexed file");

      return {
        id,
        name,
        path: relativePath,
        absolutePath: fullPath,
        size: stats.size,
        mtime: stats.mtime,
        mimeType,
      };
    } catch (err) {
      log.error({ path: relativePath, err }, "Failed to index file");
      return null;
    }
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
