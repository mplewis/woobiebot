import { describe, expect, it, vi } from "vitest";
import { formatAllResultsList, formatSearchResults } from "./format.js";
import type { SearchResult } from "./indexer.js";
import type { RateLimitResult } from "./rateLimiter.js";

describe("formatSearchResults", () => {
  const mockResults: SearchResult[] = [
    {
      file: {
        id: "file1",
        name: "test1.txt",
        path: "test1.txt",
        absolutePath: "/path/test1.txt",
        size: 100,
        mtime: new Date("2024-01-01"),
        mimeType: "text/plain",
      },
      score: 0.5,
    },
    {
      file: {
        id: "file2",
        name: "test2.txt",
        path: "test2.txt",
        absolutePath: "/path/test2.txt",
        size: 200,
        mtime: new Date("2024-01-02"),
        mimeType: "text/plain",
      },
      score: 0.6,
    },
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
      - [test2.txt](http://localhost:3000/download?userId=user123&fileId=file2)

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
      - [test2.txt](http://localhost:3000/download?userId=user123&fileId=file2)

      Links expire <t:1705313400:R>.
      You have 1 download remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });

  it("formats with results exceeding message length limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const manyResults: SearchResult[] = Array.from({ length: 50 }, (_, i) => ({
      file: {
        id: `file${i}`,
        name: `test-file-with-a-very-long-name-to-exceed-message-limits-${i}.txt`,
        path: `very/long/path/to/exceed/message/length/limits/test-file-with-a-very-long-name-to-exceed-message-limits-${i}.txt`,
        absolutePath: `/absolute/very/long/path/to/exceed/message/length/limits/test-file-with-a-very-long-name-to-exceed-message-limits-${i}.txt`,
        size: 100,
        mtime: new Date("2024-01-01"),
        mimeType: "text/plain",
      },
      score: 0.5,
    }));

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
});

describe("formatAllResultsList", () => {
  const mockResults: SearchResult[] = Array.from({ length: 20 }, (_, i) => ({
    file: {
      id: `file${i}`,
      name: `test${i}.txt`,
      path: `folder/test${i}.txt`,
      absolutePath: `/path/folder/test${i}.txt`,
      size: 100 * i,
      mtime: new Date("2024-01-01"),
      mimeType: "text/plain",
    },
    score: 0.5,
  }));

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
      "folder/test0.txt
      folder/test1.txt
      folder/test2.txt"
    `);
  });
});
