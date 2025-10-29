import { describe, expect, it, vi } from "vitest";
import {
  bytesToMB,
  formatAllResultsList,
  formatListResults,
  formatSearchResults,
  partitionResultsByScore,
} from "./format.js";
import type { FileMetadata, SearchResult } from "./indexer.js";
import type { RateLimitResult } from "./rateLimiter.js";

/**
 * Factory function to create SearchResult objects with sensible defaults.
 * Accepts partial overrides for any field.
 */
function createSearchResult(overrides: {
  id?: string;
  name?: string;
  path?: string;
  absolutePath?: string;
  size?: number;
  mtime?: Date;
  mimeType?: string;
  score?: number;
}): SearchResult {
  const name = overrides.name ?? "test.txt";
  const path = overrides.path ?? name;
  const absolutePath = overrides.absolutePath ?? `/path/${path}`;

  return {
    file: {
      id: overrides.id ?? "file1",
      name,
      path,
      absolutePath,
      size: overrides.size ?? 100,
      mtime: overrides.mtime ?? new Date("2024-01-01"),
      mimeType: overrides.mimeType ?? "text/plain",
    },
    score: overrides.score ?? 0.5,
  };
}

describe("formatSearchResults", () => {
  const mockResults: SearchResult[] = [
    createSearchResult({ path: "test1.txt", score: 0.5 }),
    createSearchResult({ path: "test2.txt", score: 0.6 }),
  ];

  const mockRateLimitResult: RateLimitResult = {
    allowed: true,
    remainingTokens: 5,
    resetAt: new Date("2024-01-15T12:00:00Z"),
  };

  const mockGenerateDownloadUrl = (userId: string, fileId: string) =>
    `http://localhost:3000/download?userId=${userId}&fileId=${fileId}`;

  it("formats basic search results with multiple files", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const result = formatSearchResults({
      query: "test",
      results: mockResults,
      userId: "user123",
      rateLimitResult: mockRateLimitResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
    });

    expect(result.content).toMatchInlineSnapshot(`
      "Found 2 files matching "test":

      - [\`test1.txt\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`test2.txt\`](http://localhost:3000/download?userId=user123&fileId=file1)

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);
    expect(result.components).toBeUndefined();

    vi.useRealTimers();
  });

  it("formats with singular download remaining", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const singleTokenResult: RateLimitResult = {
      ...mockRateLimitResult,
      remainingTokens: 1,
    };

    const result = formatSearchResults({
      query: "test",
      results: mockResults,
      userId: "user123",
      rateLimitResult: singleTokenResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
    });

    expect(result.content).toMatchInlineSnapshot(`
      "Found 2 files matching "test":

      - [\`test1.txt\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`test2.txt\`](http://localhost:3000/download?userId=user123&fileId=file1)

      Links expire <t:1705313400:R>.
      You have 1 download remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });

  it("formats with results exceeding message length limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const manyResults: SearchResult[] = Array.from({ length: 50 }, (_, i) =>
      createSearchResult({
        path: `very/long/path/to/exceed/message/length/limits/test-file-with-a-very-long-name-to-exceed-message-limits-${i}.txt`,
      }),
    );

    const result = formatSearchResults({
      query: "test",
      results: manyResults,
      userId: "user123",
      rateLimitResult: mockRateLimitResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
    });

    expect(result.content).toContain('Found 50 files matching "test"');
    expect(result.content).toContain("...and");
    expect(result.content).toContain("more");
    expect(result.components).toBeDefined();
    expect(result.components).toHaveLength(1);

    vi.useRealTimers();
  });

  it("sorts results by relevance score", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const unsortedResults: SearchResult[] = [
      createSearchResult({ path: "patterns/granny-square-blanket.pdf", score: 0.65 }),
      createSearchResult({ path: "patterns/amigurumi/amigurumi-octopus.pdf", score: 0.05 }),
      createSearchResult({ path: "patterns/beginner-scarf.pdf", score: 0.82 }),
      createSearchResult({ path: "patterns/amigurumi/amigurumi-bunny.pdf", score: 0.08 }),
      createSearchResult({ path: "patterns/accessories/chunky-hat.pdf", score: 0.9 }),
      createSearchResult({ path: "patterns/amigurumi/amigurumi-bear.pdf", score: 0.12 }),
      createSearchResult({ path: "patterns/accessories/lacy-shawl.pdf", score: 0.75 }),
      createSearchResult({ path: "patterns/amigurumi/amigurumi-cat.pdf", score: 0.1 }),
      createSearchResult({ path: "patterns/accessories/cozy-mittens.pdf", score: 0.88 }),
      createSearchResult({ path: "patterns/amigurumi/amigurumi-dragon.pdf", score: 0.15 }),
    ];

    const result = formatSearchResults({
      query: "amigurumi",
      results: unsortedResults,
      userId: "user123",
      rateLimitResult: mockRateLimitResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
    });

    expect(result.content).toMatchInlineSnapshot(`
      "Found 10 files matching "amigurumi":

      - [\`patterns/amigurumi/amigurumi-octopus.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/amigurumi/amigurumi-bunny.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/amigurumi/amigurumi-cat.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/amigurumi/amigurumi-bear.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/amigurumi/amigurumi-dragon.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/granny-square-blanket.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/accessories/lacy-shawl.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/beginner-scarf.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/accessories/cozy-mittens.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)
      - [\`patterns/accessories/chunky-hat.pdf\`](http://localhost:3000/download?userId=user123&fileId=file1)

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });

  it("wraps file paths in backticks to prevent Discord italic formatting", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const resultsWithUnderscores: SearchResult[] = [
      createSearchResult({ path: "patterns/baby_blanket_pattern.pdf", score: 0.1 }),
      createSearchResult({ path: "crafts/knitting_for_beginners.pdf", score: 0.2 }),
    ];

    const result = formatSearchResults({
      query: "pattern",
      results: resultsWithUnderscores,
      userId: "user123",
      rateLimitResult: mockRateLimitResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
    });

    expect(result.content).toContain("`patterns/baby_blanket_pattern.pdf`");
    expect(result.content).toContain("`crafts/knitting_for_beginners.pdf`");
    expect(result.content).not.toContain("[patterns/baby_blanket_pattern.pdf]");
    expect(result.content).not.toContain("[crafts/knitting_for_beginners.pdf]");

    vi.useRealTimers();
  });

  it("truncates long query in button custom ID to respect Discord limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const longQuery =
      "path/to/very/long/filename/that/exceeds/the/discord/custom/id/limit/of/one/hundred/characters/example.pdf";
    const manyResults: SearchResult[] = Array.from({ length: 50 }, (_, i) =>
      createSearchResult({ path: `file-${i}.txt` }),
    );

    const result = formatSearchResults({
      query: longQuery,
      results: manyResults,
      userId: "user123",
      rateLimitResult: mockRateLimitResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
    });

    expect(result.components).toBeDefined();
    expect(result.components).toHaveLength(1);

    if (!result.components) {
      throw new Error("Expected components to be defined");
    }

    const row = result.components[0];
    if (!row) {
      throw new Error("Expected action row to exist");
    }

    const button = row.components[0];
    if (!button) {
      throw new Error("Expected button to exist");
    }

    const buttonData = button.data as { custom_id?: string };
    const customId = buttonData.custom_id;

    expect(customId).toBeDefined();
    if (!customId) {
      throw new Error("Expected custom_id to be defined");
    }

    expect(customId.length).toBeLessThanOrEqual(100);
    expect(customId.startsWith("list_all:")).toBe(true);
    expect(customId).toBe(`list_all:${longQuery.slice(0, 91)}`);

    vi.useRealTimers();
  });
});

describe("formatAllResultsList", () => {
  const mockResults: SearchResult[] = Array.from({ length: 20 }, (_, i) =>
    createSearchResult({ path: `folder/test${i}.txt` }),
  );

  it("formats all results as file attachment", () => {
    const result = formatAllResultsList("test", mockResults);

    expect(result.content).toContain('All 20 files matching "test"');
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.name).toBe("search-results-test.txt");

    const fileContent = result.files[0]?.attachment.toString();
    expect(fileContent).toContain("folder/test0.txt");
    expect(fileContent).toContain("folder/test19.txt");
    expect(fileContent).not.toContain("http");
    expect(fileContent).not.toContain("download");
  });

  it("formats with few results", () => {
    const fewResults = mockResults.slice(0, 3);
    const result = formatAllResultsList("query", fewResults);

    expect(result.content).toBe('All 3 files matching "query":');
    expect(result.files).toHaveLength(1);

    const fileContent = result.files[0]?.attachment.toString();
    expect(fileContent).toMatchInlineSnapshot(`
      "MODERATE RELEVANCE
      ========================================
      folder/test0.txt
      folder/test1.txt
      folder/test2.txt"
    `);
  });

  it("sorts results into three score groups, alphabetized within each", () => {
    const mixedResults: SearchResult[] = [
      createSearchResult({ path: "patterns/amigurumi/amigurumi-cat.pdf", score: 0.1 }),
      createSearchResult({ path: "patterns/amigurumi/bunny-amigurumi.pdf", score: 0.15 }),
      createSearchResult({ path: "patterns/amigurumi/zebra-amigurumi.pdf", score: 0.2 }),
      createSearchResult({ path: "patterns/bear-pattern.pdf", score: 0.4 }),
      createSearchResult({ path: "patterns/toys/dragon-amigurumi.pdf", score: 0.5 }),
      createSearchResult({ path: "patterns/amigurumi/elephant-amigurumi.pdf", score: 0.6 }),
      createSearchResult({ path: "patterns/accessories/hat-pattern.pdf", score: 0.8 }),
      createSearchResult({ path: "patterns/accessories/scarf-pattern.pdf", score: 0.85 }),
      createSearchResult({ path: "patterns/socks/wool-socks.pdf", score: 0.9 }),
    ];

    const result = formatAllResultsList("amigurumi", mixedResults);

    expect(result.content).toBe('All 9 files matching "amigurumi":');
    expect(result.files).toHaveLength(1);

    const fileContent = result.files[0]?.attachment.toString();
    expect(fileContent).toMatchInlineSnapshot(`
      "MOST RELEVANT
      ========================================
      patterns/amigurumi/amigurumi-cat.pdf
      patterns/amigurumi/bunny-amigurumi.pdf
      patterns/amigurumi/zebra-amigurumi.pdf

      MODERATE RELEVANCE
      ========================================
      patterns/bear-pattern.pdf
      patterns/toys/dragon-amigurumi.pdf

      LEAST RELEVANT
      ========================================
      patterns/accessories/hat-pattern.pdf
      patterns/accessories/scarf-pattern.pdf
      patterns/amigurumi/elephant-amigurumi.pdf
      patterns/socks/wool-socks.pdf"
    `);
  });
});

describe("partitionResultsByScore", () => {
  it("partitions results with comprehensive edge cases", () => {
    const results: SearchResult[] = [
      createSearchResult({ path: "absolute-zero.txt", score: 0.0 }),
      createSearchResult({ path: "very-best.txt", score: 0.05 }),
      createSearchResult({ path: "best.txt", score: 0.15 }),
      createSearchResult({ path: "just-below-best-threshold.txt", score: 0.19 }),
      createSearchResult({ path: "at-best-threshold.txt", score: 0.2 }),
      createSearchResult({ path: "low-medium.txt", score: 0.25 }),
      createSearchResult({ path: "mid-medium.txt", score: 0.4 }),
      createSearchResult({ path: "high-medium.txt", score: 0.5 }),
      createSearchResult({ path: "just-below-worst-threshold.txt", score: 0.59 }),
      createSearchResult({ path: "at-worst-threshold.txt", score: 0.6 }),
      createSearchResult({ path: "worst.txt", score: 0.65 }),
      createSearchResult({ path: "very-worst.txt", score: 0.8 }),
      createSearchResult({ path: "extremely-worst.txt", score: 0.85 }),
      createSearchResult({ path: "near-max.txt", score: 0.9 }),
      createSearchResult({ path: "absolute-max.txt", score: 1.0 }),
    ];

    const partitioned = partitionResultsByScore(results);

    const simplified = Object.entries(partitioned).reduce(
      (
        acc: Record<string, { file: { id: string; name: string; path: string } }[]>,
        [key, group],
      ) => {
        acc[key] = group.map((r: { file: { path: string } }) => r.file.path);
        return acc;
      },
      {},
    );

    expect(simplified).toMatchInlineSnapshot(`
      {
        "best": [
          "absolute-zero.txt",
          "at-best-threshold.txt",
          "best.txt",
          "just-below-best-threshold.txt",
          "low-medium.txt",
          "very-best.txt",
        ],
        "medium": [
          "high-medium.txt",
          "just-below-worst-threshold.txt",
          "mid-medium.txt",
        ],
        "worst": [
          "absolute-max.txt",
          "at-worst-threshold.txt",
          "extremely-worst.txt",
          "near-max.txt",
          "very-worst.txt",
          "worst.txt",
        ],
      }
    `);
  });
});

describe("bytesToMB", () => {
  it("converts bytes to MB with 2 decimal places", () => {
    expect(bytesToMB(1048576)).toBe("1.00");
  });

  it("handles zero bytes", () => {
    expect(bytesToMB(0)).toBe("0.00");
  });

  it("handles small file sizes", () => {
    expect(bytesToMB(512)).toBe("0.00");
  });

  it("handles fractional megabytes", () => {
    expect(bytesToMB(1572864)).toBe("1.50");
  });

  it("handles large file sizes", () => {
    expect(bytesToMB(104857600)).toBe("100.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(bytesToMB(1234567)).toBe("1.18");
  });

  it("handles exact multiples of MB", () => {
    expect(bytesToMB(5242880)).toBe("5.00");
  });
});

describe("formatListResults", () => {
  function createFile(path: string, mtimeOffset: number): FileMetadata {
    return {
      id: `id-${path}`,
      name: path.split("/").pop() || path,
      path,
      absolutePath: `/abs/${path}`,
      size: 1024,
      mtime: new Date(Date.now() - mtimeOffset * 1000),
      mimeType: "text/plain",
    };
  }

  it("formats recent files with default count of 20", () => {
    const files: FileMetadata[] = Array.from({ length: 30 }, (_, i) =>
      createFile(`file-${i}.txt`, i * 100),
    );

    const result = formatListResults({ files, mode: 20 });

    expect(result.content).toBeDefined();
    expect(result.content).toContain("20 most recent files:");
    expect(result.content).toContain("file-0.txt");
    expect(result.content).toContain("<t:");
    expect(result.content).toContain(":R>");
    expect(result.files).toBeUndefined();
  });

  it("formats recent files with custom count", () => {
    const files: FileMetadata[] = Array.from({ length: 100 }, (_, i) =>
      createFile(`file-${i}.txt`, i * 100),
    );

    const result = formatListResults({ files, mode: 50 });

    expect(result.content).toBeDefined();
    expect(result.content).toContain("50 most recent files (of 100 total):");
    expect(result.content).toContain("file-0.txt");
    expect(result.files).toBeUndefined();
  });

  it("formats all files alphabetically without timestamps", () => {
    const files: FileMetadata[] = [
      createFile("zebra.txt", 100),
      createFile("apple.txt", 200),
      createFile("banana.txt", 150),
    ];

    const result = formatListResults({ files, mode: "all" });

    expect(result.content).toBeDefined();
    expect(result.content).toContain("All 3 files:");
    expect(result.content).toContain("- apple.txt");
    expect(result.content).toContain("- banana.txt");
    expect(result.content).toContain("- zebra.txt");
    expect(result.content).not.toContain("<t:");
    expect(result.files).toBeUndefined();

    const lines = result.content?.split("\n").filter((line) => line.startsWith("-"));
    expect(lines).toEqual(["- apple.txt", "- banana.txt", "- zebra.txt"]);
  });

  it("sorts recent files by modification time descending", () => {
    const files: FileMetadata[] = [
      createFile("old.txt", 300),
      createFile("newest.txt", 0),
      createFile("middle.txt", 150),
    ];

    const result = formatListResults({ files, mode: 3 });

    expect(result.content).toBeDefined();
    const lines = result.content?.split("\n").filter((line) => line.startsWith("-"));
    expect(lines?.[0]).toContain("newest.txt");
    expect(lines?.[1]).toContain("middle.txt");
    expect(lines?.[2]).toContain("old.txt");
  });

  it("creates attachment when content exceeds Discord limit", () => {
    const files: FileMetadata[] = Array.from({ length: 500 }, (_, i) =>
      createFile(`very/long/path/to/file-with-a-very-long-name-${i}.txt`, i * 100),
    );

    const result = formatListResults({ files, mode: "all" });

    expect(result.content).toBe("All 500 files:");
    expect(result.files).toBeDefined();
    expect(result.files).toHaveLength(1);
    expect(result.files?.[0]?.name).toBe("all-files.txt");
  });

  it("uses correct attachment filename for recent files", () => {
    const files: FileMetadata[] = Array.from({ length: 500 }, (_, i) =>
      createFile(`very/long/path/to/file-with-a-very-long-name-${i}.txt`, i * 100),
    );

    const result = formatListResults({ files, mode: 100 });

    expect(result.files).toBeDefined();
    expect(result.files?.[0]?.name).toBe("recent-100-files.txt");
  });

  it("handles singular file correctly", () => {
    const files: FileMetadata[] = [createFile("single.txt", 100)];

    const result = formatListResults({ files, mode: "all" });

    expect(result.content).toContain("All 1 file:");
  });
});
