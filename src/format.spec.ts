import { describe, expect, it, vi } from "vitest";
import { formatAllResultsList, formatSearchResults, partitionResultsByScore } from "./format.js";
import type { SearchResult } from "./indexer.js";
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
      "Found 2 file(s) matching "test":

      - [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)
      - [test2.txt](http://localhost:3000/download?userId=user123&fileId=file1)

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
      "Found 2 file(s) matching "test":

      - [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)
      - [test2.txt](http://localhost:3000/download?userId=user123&fileId=file1)

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

    expect(result.content).toContain('Found 50 file(s) matching "test"');
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
      "Found 10 file(s) matching "amigurumi":

      - [patterns/amigurumi/amigurumi-octopus.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/amigurumi/amigurumi-bunny.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/amigurumi/amigurumi-cat.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/amigurumi/amigurumi-bear.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/amigurumi/amigurumi-dragon.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/granny-square-blanket.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/accessories/lacy-shawl.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/beginner-scarf.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/accessories/cozy-mittens.pdf](http://localhost:3000/download?userId=user123&fileId=file1)
      - [patterns/accessories/chunky-hat.pdf](http://localhost:3000/download?userId=user123&fileId=file1)

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });
});

describe("formatAllResultsList", () => {
  const mockResults: SearchResult[] = Array.from({ length: 20 }, (_, i) =>
    createSearchResult({ path: `folder/test${i}.txt` }),
  );

  it("formats all results as file attachment", () => {
    const result = formatAllResultsList("test", mockResults);

    expect(result.content).toContain('All 20 file(s) matching "test"');
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

    expect(result.content).toBe('All 3 file(s) matching "query":');
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

    expect(result.content).toBe('All 9 file(s) matching "amigurumi":');
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
