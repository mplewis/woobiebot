import type { DirectoryTree, FileMetadata } from "../../shared/types.js";
import { validateFilename, validateNoExistingFile } from "../../validation.js";

/**
 * Extracts the directory path from a full file path by removing the filename.
 *
 * @param filePath - The full path to the file
 */
export function extractDirectoryPath(filePath: string): string {
  const pathParts = filePath.split("/");
  pathParts.pop();
  return pathParts.join("/");
}

/**
 * Checks if a file extension is in the list of allowed extensions.
 *
 * @param fileName - The name of the file to check
 * @param allowedExtensions - List of allowed file extensions (e.g., ['.pdf', '.txt'])
 */
export function isAllowedFileExtension(fileName: string, allowedExtensions: string[]): boolean {
  const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  const normalizedAllowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());
  return normalizedAllowedExtensions.includes(fileExtension);
}

/**
 * Validates file size against maximum allowed size in MB.
 *
 * @param fileSizeBytes - The file size in bytes
 * @param maxSizeMB - The maximum allowed file size in megabytes
 */
export function validateFileSize(
  fileSizeBytes: number,
  maxSizeMB: number,
): { valid: true } | { valid: false; actualSizeMB: number } {
  const fileSizeMB = fileSizeBytes / (1024 * 1024);
  if (fileSizeMB > maxSizeMB) {
    return { valid: false, actualSizeMB: fileSizeMB };
  }
  return { valid: true };
}

/**
 * Normalizes a search term by trimming and converting to lowercase.
 *
 * @param searchTerm - The search term to normalize
 */
export function normalizeSearchTerm(searchTerm: string): string {
  return searchTerm.toLowerCase().trim();
}

/**
 * Checks if a filename matches a normalized search term (case-insensitive substring match).
 *
 * @param fileName - The filename to check
 * @param normalizedSearchTerm - The normalized search term to match against
 */
export function fileMatchesSearch(fileName: string, normalizedSearchTerm: string): boolean {
  return fileName.toLowerCase().includes(normalizedSearchTerm);
}

/**
 * Gets all filenames in a directory at the given path.
 *
 * @param dirPath - The directory path to get files from
 * @param tree - The directory tree to search in
 */
export function getFilesInDirectory(dirPath: string, tree: DirectoryTree): string[] {
  const pathParts = dirPath.split("/").filter((p) => p.length > 0);
  let current: DirectoryTree | FileMetadata[] | undefined = tree;

  for (const part of pathParts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = current[part];
    } else {
      return [];
    }
  }

  if (current && typeof current === "object" && !Array.isArray(current)) {
    const files = current["_files"];
    if (Array.isArray(files)) {
      return files.map((f) => f.name);
    }
  }

  return [];
}

/**
 * Determines the rename button state and text based on form values.
 *
 * @param currentPath - The current directory path of the file
 * @param currentName - The current name of the file
 * @param newPath - The new directory path for the file
 * @param newName - The new name for the file
 * @param allowedExtensions - List of allowed file extensions
 * @param filesInTargetDir - List of existing filenames in the target directory
 */
export function determineRenameOperation(
  currentPath: string,
  currentName: string,
  newPath: string,
  newName: string,
  allowedExtensions: string[],
  filesInTargetDir: string[],
): {
  disabled: boolean;
  buttonText: string;
  statusMessage: string;
  statusType: "info" | "error" | "success";
} {
  const validationError = validateFilename(newName, allowedExtensions);

  if (validationError) {
    return {
      disabled: true,
      buttonText: "Rename",
      statusMessage: validationError,
      statusType: "error",
    };
  }

  const pathChanged = newPath !== currentPath;
  const nameChanged = newName !== currentName;

  if (!pathChanged && !nameChanged) {
    return {
      disabled: true,
      buttonText: "Rename",
      statusMessage: "",
      statusType: "info",
    };
  }

  const existingFileError = validateNoExistingFile(newName, filesInTargetDir);

  if (existingFileError && (pathChanged || nameChanged)) {
    return {
      disabled: true,
      buttonText: "Rename",
      statusMessage: existingFileError,
      statusType: "error",
    };
  }

  let buttonText = "Rename";
  if (pathChanged && nameChanged) {
    buttonText = "Move and Rename";
  } else if (pathChanged) {
    buttonText = "Move";
  }

  return {
    disabled: false,
    buttonText,
    statusMessage: "",
    statusType: "info",
  };
}
