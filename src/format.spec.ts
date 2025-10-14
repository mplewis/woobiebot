import { describe, expect, it, vi } from "vitest";
import { formatSearchResults } from "./format.js";
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
      maxResults: 10,
    });

    expect(result).toMatchInlineSnapshot(`
      "Found 2 file(s) matching "test":

      • [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)
      • [test2.txt](http://localhost:3000/download?userId=user123&fileId=file2)

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);

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
      maxResults: 10,
    });

    expect(result).toMatchInlineSnapshot(`
      "Found 2 file(s) matching "test":

      • [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)
      • [test2.txt](http://localhost:3000/download?userId=user123&fileId=file2)

      Links expire <t:1705313400:R>.
      You have 1 download remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });

  it("formats with results exceeding maxResults", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const manyResults: SearchResult[] = Array.from({ length: 15 }, (_, i) => ({
      file: {
        id: `file${i}`,
        name: `test${i}.txt`,
        path: `test${i}.txt`,
        absolutePath: `/path/test${i}.txt`,
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
      maxResults: 10,
    });

    expect(result).toMatchInlineSnapshot(`
      "Found 15 file(s) matching "test":

      • [test0.txt](http://localhost:3000/download?userId=user123&fileId=file0)
      • [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)
      • [test2.txt](http://localhost:3000/download?userId=user123&fileId=file2)
      • [test3.txt](http://localhost:3000/download?userId=user123&fileId=file3)
      • [test4.txt](http://localhost:3000/download?userId=user123&fileId=file4)
      • [test5.txt](http://localhost:3000/download?userId=user123&fileId=file5)
      • [test6.txt](http://localhost:3000/download?userId=user123&fileId=file6)
      • [test7.txt](http://localhost:3000/download?userId=user123&fileId=file7)
      • [test8.txt](http://localhost:3000/download?userId=user123&fileId=file8)
      • [test9.txt](http://localhost:3000/download?userId=user123&fileId=file9)
      ...and 5 more

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });

  it("formats with exactly maxResults", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const exactResults: SearchResult[] = Array.from({ length: 10 }, (_, i) => ({
      file: {
        id: `file${i}`,
        name: `test${i}.txt`,
        path: `test${i}.txt`,
        absolutePath: `/path/test${i}.txt`,
        size: 100,
        mtime: new Date("2024-01-01"),
        mimeType: "text/plain",
      },
      score: 0.5,
    }));

    const result = formatSearchResults({
      query: "test",
      results: exactResults,
      userId: "user123",
      rateLimitResult: mockRateLimitResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
      maxResults: 10,
    });

    expect(result).toMatchInlineSnapshot(`
      "Found 10 file(s) matching "test":

      • [test0.txt](http://localhost:3000/download?userId=user123&fileId=file0)
      • [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)
      • [test2.txt](http://localhost:3000/download?userId=user123&fileId=file2)
      • [test3.txt](http://localhost:3000/download?userId=user123&fileId=file3)
      • [test4.txt](http://localhost:3000/download?userId=user123&fileId=file4)
      • [test5.txt](http://localhost:3000/download?userId=user123&fileId=file5)
      • [test6.txt](http://localhost:3000/download?userId=user123&fileId=file6)
      • [test7.txt](http://localhost:3000/download?userId=user123&fileId=file7)
      • [test8.txt](http://localhost:3000/download?userId=user123&fileId=file8)
      • [test9.txt](http://localhost:3000/download?userId=user123&fileId=file9)

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });

  it("formats with custom maxResults parameter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const manyResults: SearchResult[] = Array.from({ length: 10 }, (_, i) => ({
      file: {
        id: `file${i}`,
        name: `test${i}.txt`,
        path: `test${i}.txt`,
        absolutePath: `/path/test${i}.txt`,
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
      maxResults: 3,
    });

    expect(result).toMatchInlineSnapshot(`
      "Found 10 file(s) matching "test":

      • [test0.txt](http://localhost:3000/download?userId=user123&fileId=file0)
      • [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)
      • [test2.txt](http://localhost:3000/download?userId=user123&fileId=file2)
      ...and 7 more

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });

  it("formats single result", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const firstResult = mockResults[0];
    if (!firstResult) {
      throw new Error("Expected first mock result to exist");
    }

    const result = formatSearchResults({
      query: "test",
      results: [firstResult],
      userId: "user123",
      rateLimitResult: mockRateLimitResult,
      urlExpiryMs: 600000,
      generateDownloadUrl: mockGenerateDownloadUrl,
      maxResults: 10,
    });

    expect(result).toMatchInlineSnapshot(`
      "Found 1 file(s) matching "test":

      • [test1.txt](http://localhost:3000/download?userId=user123&fileId=file1)

      Links expire <t:1705313400:R>.
      You have 5 downloads remaining, refreshing <t:1705320000:R>."
    `);

    vi.useRealTimers();
  });
});
