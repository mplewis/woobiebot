import { z } from "zod";

/**
 * Zod schema definitions for frontend-backend communication.
 * These schemas provide runtime validation and type inference.
 */

/**
 * Metadata for a file in the indexed directory.
 */
export const FileMetadataSchema = z.object({
  id: z.string().describe("Unique identifier for the file"),
  name: z.string().describe("Filename without path"),
  path: z.string().describe("Relative path from the indexed root directory"),
  absolutePath: z.string().describe("Absolute filesystem path"),
  size: z.number().int().nonnegative().describe("File size in bytes"),
  mtime: z.coerce.date().describe("Last modified timestamp"),
  mimeType: z.string().describe("MIME type of the file"),
});

export type FileMetadata = z.infer<typeof FileMetadataSchema>;

/**
 * Recursive directory tree structure where each key is a directory name
 * or the special "_files" key containing FileMetadata for files in that directory.
 */
export type DirectoryTree = {
  [key: string]: DirectoryTree | FileMetadata[] | undefined;
  _files?: FileMetadata[];
};

export const DirectoryTreeSchema: z.ZodType<DirectoryTree> = z.lazy(() =>
  z.record(
    z.string(),
    z.union([z.lazy(() => DirectoryTreeSchema), z.array(FileMetadataSchema), z.undefined()]),
  ),
);

/**
 * Authentication data for secure API requests.
 */
export const AuthDataSchema = z.object({
  userId: z.string().describe("Unique user identifier"),
  signature: z.string().describe("HMAC signature for request verification"),
  expiresAt: z.number().int().describe("Unix timestamp when the authentication expires"),
});

export type AuthData = z.infer<typeof AuthDataSchema>;

/**
 * Proof-of-work challenge parameters for captcha verification.
 */
export const ChallengeSchema = z.object({
  c: z.number().int().positive().describe("Count: number of hash challenges to solve"),
  s: z
    .number()
    .int()
    .positive()
    .describe("Salt length: length of the random salt string in hex characters"),
  d: z
    .number()
    .int()
    .positive()
    .describe("Difficulty: number of leading hex characters the hash must match"),
});

export type Challenge = z.infer<typeof ChallengeSchema>;

/**
 * Server-side data injected into the captcha page for challenge solving.
 */
export const CaptchaPageDataSchema = z.object({
  challenge: ChallengeSchema.describe("The proof-of-work challenge to solve"),
  token: z.string().describe("Unique token for this captcha session"),
  signature: z.string().describe("HMAC signature for verification"),
  userId: z.string().describe("User identifier requesting the file"),
  fileId: z.string().describe("File identifier being requested"),
});

export type CaptchaPageData = z.infer<typeof CaptchaPageDataSchema>;

/**
 * Server-side data injected into the file management page.
 */
export const ManagePageDataSchema = z.object({
  userId: z.string().describe("Unique user identifier"),
  signature: z.string().describe("HMAC signature for request verification"),
  expiresAt: z.number().int().describe("Unix timestamp when the authentication expires"),
  directoryTree: DirectoryTreeSchema.describe(
    "Complete directory tree structure with all indexed files",
  ),
  allowedExtensions: z
    .array(z.string())
    .describe("List of allowed file extensions (e.g., ['.pdf', '.txt'])"),
  maxFileSizeMB: z.number().positive().describe("Maximum allowed file size in megabytes"),
});

export type ManagePageData = z.infer<typeof ManagePageDataSchema>;

/**
 * Response from the file upload endpoint.
 */
export const UploadResponseSchema = z.object({
  success: z.boolean().describe("Whether the upload succeeded"),
  error: z.string().optional().describe("Error message if upload failed"),
  fileId: z.string().optional().describe("ID of the uploaded file if successful"),
});

export type UploadResponse = z.infer<typeof UploadResponseSchema>;

/**
 * Response from the file deletion endpoint.
 */
export const DeleteResponseSchema = z.object({
  success: z.boolean().describe("Whether the deletion succeeded"),
  error: z.string().optional().describe("Error message if deletion failed"),
});

export type DeleteResponse = z.infer<typeof DeleteResponseSchema>;

/**
 * Response from the file rename/move endpoint.
 */
export const RenameResponseSchema = z.object({
  success: z.boolean().describe("Whether the rename/move succeeded"),
  error: z.string().optional().describe("Error message if rename/move failed"),
  message: z.string().optional().describe("Success message"),
});

export type RenameResponse = z.infer<typeof RenameResponseSchema>;

/**
 * Request body for the captcha verification endpoint.
 */
export const VerifyRequestSchema = z.object({
  userId: z.string().min(1).describe("User identifier requesting the file"),
  fileId: z.string().min(1).describe("File identifier being requested"),
  token: z.string().min(1).describe("Unique token for this captcha session"),
  challenge: z.string().min(1).describe("Serialized challenge data"),
  signature: z.string().min(1).describe("HMAC signature for verification"),
  solution: z.string().min(1).describe("Comma-separated list of challenge solutions"),
});

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

/**
 * Response from the captcha verification endpoint.
 */
export const VerifyResponseSchema = z.object({
  error: z.string().optional().describe("Error message if verification failed"),
});

export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

/**
 * Query parameters for the file deletion endpoint.
 */
export const DeleteQueryParamsSchema = z.object({
  userId: z.string().min(1).describe("User identifier"),
  signature: z.string().min(1).describe("HMAC signature for authentication"),
  expiresAt: z.string().min(1).describe("Unix timestamp when authentication expires"),
});

export type DeleteQueryParams = z.infer<typeof DeleteQueryParamsSchema>;

/**
 * Form fields for the file upload endpoint.
 */
export const UploadFormFieldsSchema = z.object({
  userId: z.string().min(1).describe("User identifier"),
  signature: z.string().min(1).describe("HMAC signature for authentication"),
  expiresAt: z.string().min(1).describe("Unix timestamp when authentication expires"),
  directory: z.string().default("").describe("Target directory for upload (optional)"),
});

export type UploadFormFields = z.infer<typeof UploadFormFieldsSchema>;

/**
 * Fastify request type augmentation for management authentication.
 * Adds manageAuth context to requests after successful middleware verification.
 */
declare module "fastify" {
  interface FastifyRequest {
    manageAuth?: {
      userId: string;
      expiresAt: number;
    };
  }
}
