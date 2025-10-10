import { createHash } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a deterministic file ID from a filename using SHA-256 hash.
 * The ID is encoded using only lowercase letters and digits (a-z, 0-9) for easy typing.
 */
export function generateFileId(filename: string, length = 8): string {
  const hash = createHash("sha256").update(filename).digest();

  let id = "";
  for (let i = 0; i < length; i++) {
    const byte = hash[i % hash.length];
    if (byte === undefined) {
      throw new Error("Hash generation failed");
    }
    id += ALPHABET[byte % ALPHABET.length];
  }

  return id;
}
