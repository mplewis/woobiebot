/**
 * Shared type definitions for frontend-backend communication.
 */

/**
 * Metadata for a file in the indexed directory.
 */
export interface FileMetadata {
  /** Unique identifier for the file */
  id: string;
  /** Filename without path */
  name: string;
  /** Relative path from the indexed root directory */
  path: string;
  /** Absolute filesystem path */
  absolutePath: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  mtime: Date;
  /** MIME type of the file */
  mimeType: string;
}

/**
 * Recursive directory tree structure where each key is a directory name
 * or the special "_files" key containing FileMetadata for files in that directory.
 */
export interface DirectoryTreeNode {
  [key: string]: DirectoryTreeNode | FileMetadata[] | undefined;
  /** Files in the current directory */
  _files?: FileMetadata[];
}

/**
 * Root type for directory tree structure.
 */
export type DirectoryTree = DirectoryTreeNode;

/**
 * Authentication data for secure API requests.
 */
export interface AuthData {
  /** Unique user identifier */
  userId: string;
  /** Authentication token */
  token: string;
  /** HMAC signature for request verification */
  signature: string;
  /** Unix timestamp when the authentication expires */
  expiresAt: number;
}

/**
 * Proof-of-work challenge parameters for captcha verification.
 */
export interface Challenge {
  /** Count: number of hash challenges to solve */
  c: number;
  /** Salt length: length of the random salt string in hex characters */
  s: number;
  /** Difficulty: number of leading hex characters the hash must match */
  d: number;
}

/**
 * Server-side data injected into the captcha page for challenge solving.
 */
export interface CaptchaPageData {
  /** The proof-of-work challenge to solve */
  challenge: Challenge;
  /** Unique token for this captcha session */
  token: string;
  /** HMAC signature for verification */
  signature: string;
  /** User identifier requesting the file */
  userId: string;
  /** File identifier being requested */
  fileId: string;
}

/**
 * Server-side data injected into the file management page.
 */
export interface ManagePageData {
  /** Unique user identifier */
  userId: string;
  /** Authentication token */
  token: string;
  /** HMAC signature for request verification */
  signature: string;
  /** Unix timestamp when the authentication expires */
  expiresAt: number;
  /** Complete directory tree structure with all indexed files */
  directoryTree: DirectoryTree;
}

/**
 * Response from the file upload endpoint.
 */
export interface UploadResponse {
  /** Whether the upload succeeded */
  success: boolean;
  /** Error message if upload failed */
  error?: string;
  /** ID of the uploaded file if successful */
  fileId?: string;
}

/**
 * Response from the file deletion endpoint.
 */
export interface DeleteResponse {
  /** Whether the deletion succeeded */
  success: boolean;
  /** Error message if deletion failed */
  error?: string;
}

/**
 * Response from the captcha verification endpoint.
 */
export interface VerifyResponse {
  /** Error message if verification failed */
  error?: string;
}
