import type { DirectoryTree } from "../../shared/types.js";

const STORAGE_KEY = "dir_expand_state";

interface DirectoryState {
  expandedDirectories: string[];
}

/**
 * Retrieves the set of expanded directory paths from localStorage.
 */
export function getExpandedDirectories(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return new Set();
    }
    const data = JSON.parse(stored) as DirectoryState;
    return new Set(data.expandedDirectories);
  } catch (error) {
    console.error("Failed to load directory state:", error);
    return new Set();
  }
}

/**
 * Saves the set of expanded directory paths to localStorage.
 */
export function saveExpandedDirectories(directories: Set<string>): void {
  try {
    const data: DirectoryState = {
      expandedDirectories: Array.from(directories),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save directory state:", error);
  }
}

/**
 * Checks if a specific directory path should be expanded based on stored state.
 */
export function isExpandedDirectory(path: string): boolean {
  const expanded = getExpandedDirectories();
  return expanded.has(path);
}

/**
 * Updates the directory state when a directory is toggled.
 * Adds the path if isOpen is true, removes it if false.
 */
export function toggleDirectoryState(path: string, isOpen: boolean): void {
  const expanded = getExpandedDirectories();
  if (isOpen) {
    expanded.add(path);
  } else {
    expanded.delete(path);
  }
  saveExpandedDirectories(expanded);
}

/**
 * Recursively collects all directory paths from a directory tree.
 */
export function getAllTreePaths(tree: DirectoryTree, parentPath: string[] = []): Set<string> {
  const paths = new Set<string>();

  for (const [key, value] of Object.entries(tree)) {
    if (key === "_files") {
      continue;
    }
    const currentPath = [...parentPath, key];
    const pathString = currentPath.join("/");
    paths.add(pathString);

    if (typeof value === "object" && value !== null) {
      const childPaths = getAllTreePaths(value, currentPath);
      for (const path of childPaths) {
        paths.add(path);
      }
    }
  }

  return paths;
}

/**
 * Removes directory paths from storage that no longer exist in the current tree.
 * This prevents localStorage from accumulating stale entries.
 */
export function cleanupDeletedDirectories(tree: DirectoryTree): void {
  const validPaths = getAllTreePaths(tree);
  const storedPaths = getExpandedDirectories();

  const cleanedPaths = new Set(Array.from(storedPaths).filter((path) => validPaths.has(path)));

  if (cleanedPaths.size !== storedPaths.size) {
    saveExpandedDirectories(cleanedPaths);
  }
}
