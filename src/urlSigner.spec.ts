import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { UrlSigner } from "./urlSigner.js";

describe("UrlSigner", () => {
  let signer: UrlSigner;
  const secret = "test-secret-key-for-signing";
  const baseUrl = "https://example.com";
  const userId = "user123";
  const fileId = "file456";

  beforeEach(() => {
    signer = new UrlSigner(secret);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("signDownloadUrl", () => {
    test("generates a valid signed URL", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);

      expect(url).toContain("https://example.com/download");
      expect(url).toContain("userId=user123");
      expect(url).toContain("fileId=file456");
      expect(url).toContain("expiresAt=");
      expect(url).toContain("signature=");
    });

    test("includes correct expiration timestamp", () => {
      const expiresInMs = 3600000; // 1 hour
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, expiresInMs);

      const urlObj = new URL(url);
      const expiresAt = Number.parseInt(urlObj.searchParams.get("expiresAt") ?? "", 10);
      expect(expiresAt).toBe(Date.now() + expiresInMs);
    });

    test("generates different signatures for different users", () => {
      const url1 = signer.signDownloadUrl(baseUrl, "user1", fileId, 3600000);
      const url2 = signer.signDownloadUrl(baseUrl, "user2", fileId, 3600000);

      const sig1 = new URL(url1).searchParams.get("signature");
      const sig2 = new URL(url2).searchParams.get("signature");
      expect(sig1).not.toBe(sig2);
    });

    test("generates different signatures for different files", () => {
      const url1 = signer.signDownloadUrl(baseUrl, userId, "file1", 3600000);
      const url2 = signer.signDownloadUrl(baseUrl, userId, "file2", 3600000);

      const sig1 = new URL(url1).searchParams.get("signature");
      const sig2 = new URL(url2).searchParams.get("signature");
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifyDownloadUrl", () => {
    test("verifies a valid signed URL", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);
      const result = signer.verifyDownloadUrl(url);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(userId);
      expect(result?.fileId).toBe(fileId);
    });

    test("rejects URL with invalid signature", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);
      const tamperedUrl = url.replace(/signature=[^&]+/, "signature=invalid");

      const result = signer.verifyDownloadUrl(tamperedUrl);
      expect(result).toBeNull();
    });

    test("rejects URL with tampered userId", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);
      const tamperedUrl = url.replace("userId=user123", "userId=hacker");

      const result = signer.verifyDownloadUrl(tamperedUrl);
      expect(result).toBeNull();
    });

    test("rejects URL with tampered fileId", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);
      const tamperedUrl = url.replace("fileId=file456", "fileId=secret");

      const result = signer.verifyDownloadUrl(tamperedUrl);
      expect(result).toBeNull();
    });

    test("rejects expired URL", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);

      // Fast-forward time past expiration
      vi.advanceTimersByTime(3600001);

      const result = signer.verifyDownloadUrl(url);
      expect(result).toBeNull();
    });

    test("accepts URL just before expiration", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);

      // Fast-forward to just before expiration
      vi.advanceTimersByTime(3599999);

      const result = signer.verifyDownloadUrl(url);
      expect(result).not.toBeNull();
    });

    test("rejects URL with missing parameters", () => {
      const url = "https://example.com/download?userId=user123";
      const result = signer.verifyDownloadUrl(url);
      expect(result).toBeNull();
    });

    test("rejects URL with invalid expiresAt format", () => {
      const url =
        "https://example.com/download?userId=user123&fileId=file456&expiresAt=invalid&signature=abc";
      const result = signer.verifyDownloadUrl(url);
      expect(result).toBeNull();
    });

    test("rejects malformed URL", () => {
      const result = signer.verifyDownloadUrl("not-a-url");
      expect(result).toBeNull();
    });

    test("rejects URL signed with different secret", () => {
      const url = signer.signDownloadUrl(baseUrl, userId, fileId, 3600000);

      const differentSigner = new UrlSigner("different-secret");
      const result = differentSigner.verifyDownloadUrl(url);
      expect(result).toBeNull();
    });
  });
});
