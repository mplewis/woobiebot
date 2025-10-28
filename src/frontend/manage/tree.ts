import type { DirectoryTree, FileMetadata } from "../../shared/types.js";

/**
 * Represents a sorted directory tree entry that can be either a directory or a file list.
 */
export type TreeEntry =
  | {
      type: "directory";
      name: string;
      value: DirectoryTree;
    }
  | {
      type: "files";
      files: FileMetadata[];
    };

/**
 * Sorts directory tree entries into a consistent order: directories alphabetically, then files.
 * Returns an array of sorted entries with explicit types for easier processing.
 *
 * @param tree - The directory tree structure to sort
 * @returns Array of sorted entries with type discrimination
 */
export function sortTreeEntries(tree: DirectoryTree): TreeEntry[] {
  const entries = Object.entries(tree);
  const fileEntry = entries.find(([key]) => key === "_files");
  const dirEntries = entries
    .filter(([key]) => key !== "_files")
    .sort(([a], [b]) => a.localeCompare(b));

  const result: TreeEntry[] = [];

  for (const [name, value] of dirEntries) {
    result.push({
      type: "directory",
      name,
      value: value as DirectoryTree,
    });
  }

  if (fileEntry) {
    const [, files] = fileEntry;
    const sortedFiles = [...(files as FileMetadata[])].sort((a, b) => a.name.localeCompare(b.name));
    result.push({
      type: "files",
      files: sortedFiles,
    });
  }

  return result;
}

/**
 * Checks if a directory tree is empty (no directories or files).
 *
 * @param tree - The directory tree to check
 * @returns True if the tree has no entries or is null/undefined
 */
export function isTreeEmpty(tree: DirectoryTree | null | undefined): boolean {
  return !tree || Object.keys(tree).length === 0;
}
