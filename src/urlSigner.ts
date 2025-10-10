import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Utility for creating and verifying HMAC-signed URLs for file downloads.
 * Sign (userId, fileId, expiresAt) tuples to prevent tampering and ensure time-limited access.
 */
export class UrlSigner {
  private readonly secret: Buffer;

  constructor(secret: string) {
    this.secret = Buffer.from(secret, "utf-8");
  }

  /**
   * Generate a signed download URL with expiration.
   */
  signDownloadUrl(baseUrl: string, userId: string, fileId: string, expiresInMs: number): string {
    const expiresAt = Date.now() + expiresInMs;
    const signature = this.sign(userId, fileId, expiresAt);

    const url = new URL(`${baseUrl}/download`);
    url.searchParams.set("userId", userId);
    url.searchParams.set("fileId", fileId);
    url.searchParams.set("expiresAt", expiresAt.toString());
    url.searchParams.set("signature", signature);

    return url.toString();
  }

  /**
   * Verify a signed download URL and return the decoded parameters.
   * Return null if signature is invalid or URL has expired.
   */
  verifyDownloadUrl(url: string): {
    userId: string;
    fileId: string;
    expiresAt: number;
  } | null {
    try {
      const urlObj = new URL(url);
      const userId = urlObj.searchParams.get("userId");
      const fileId = urlObj.searchParams.get("fileId");
      const expiresAtStr = urlObj.searchParams.get("expiresAt");
      const signature = urlObj.searchParams.get("signature");

      if (!userId || !fileId || !expiresAtStr || !signature) {
        return null;
      }

      const expiresAt = Number.parseInt(expiresAtStr, 10);
      if (Number.isNaN(expiresAt)) {
        return null;
      }

      // Check expiration
      if (Date.now() > expiresAt) {
        return null;
      }

      // Verify signature
      const expectedSignature = this.sign(userId, fileId, expiresAt);
      if (!this.constantTimeCompare(signature, expectedSignature)) {
        return null;
      }

      return { userId, fileId, expiresAt };
    } catch {
      return null;
    }
  }

  private sign(userId: string, fileId: string, expiresAt: number): string {
    const hmac = createHmac("sha256", this.secret);
    hmac.update(`${userId}:${fileId}:${expiresAt}`);
    return hmac.digest("hex");
  }

  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    return timingSafeEqual(bufA, bufB);
  }
}
