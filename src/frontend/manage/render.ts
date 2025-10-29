import type { AuthData, DirectoryTree } from "../../shared/types.js";
import {
  getAllTreePaths,
  isExpandedDirectory,
  saveExpandedDirectories,
  toggleDirectoryState,
} from "./directoryState.js";
import { isTreeEmpty, sortTreeEntries } from "./tree.js";

/**
 * Recursively renders the directory tree structure into DOM elements.
 * Creates expandable directory entries with upload buttons and file entries with download links.
 * Directories are sorted alphabetically, as are files within each directory.
 *
 * @param tree - The directory tree structure to render
 * @param container - The HTML element to render the tree into
 * @param authData - Authentication data for generating download URLs
 * @param level - Current nesting level for indentation (defaults to 0)
 * @param parentPath - Array of parent directory names for building full paths (defaults to empty)
 * @param onUpload - Callback function to handle upload button clicks
 * @param onRename - Callback function to handle rename button clicks
 * @param onDelete - Callback function to handle delete button clicks
 */
export function renderDirectoryTree(
  tree: DirectoryTree,
  container: HTMLElement,
  authData: AuthData,
  level: number = 0,
  parentPath: string[] = [],
  onUpload: (directoryPath: string) => void,
  onRename: (fileId: string, filePath: string, fileName: string) => void,
  onDelete: (fileId: string, fileName: string) => void,
): void {
  if (isTreeEmpty(tree)) {
    container.innerHTML = '<div class="tree-empty">No files indexed yet</div>';
    return;
  }

  const entries = sortTreeEntries(tree);

  for (const entry of entries) {
    if (entry.type === "directory") {
      const { name, value } = entry;
      const fullPath = [...parentPath, name].join("/");

      const details = document.createElement("details");
      details.open = isExpandedDirectory(fullPath);
      details.style.paddingLeft = `${level * 20}px`;

      details.addEventListener("toggle", () => {
        toggleDirectoryState(fullPath, details.open);
      });

      const summary = document.createElement("summary");
      summary.className = "tree-dir";

      const folderContent = document.createElement("span");
      folderContent.className = "tree-dir-content";

      const icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.textContent = "▶";

      const folderName = document.createElement("span");
      folderName.className = "tree-dir-name";
      folderName.textContent = name;

      const uploadBtn = document.createElement("button");
      uploadBtn.className = "tree-upload-btn btn-xs";
      uploadBtn.textContent = "↑";
      uploadBtn.title = "Upload to this folder";
      uploadBtn.setAttribute("aria-label", `Upload to ${name} folder`);
      uploadBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onUpload(fullPath);
      };

      folderContent.appendChild(icon);
      folderContent.appendChild(folderName);
      summary.appendChild(folderContent);
      summary.appendChild(uploadBtn);

      details.appendChild(summary);

      const subContainer = document.createElement("div");
      renderDirectoryTree(
        value,
        subContainer,
        authData,
        level + 1,
        [...parentPath, name],
        onUpload,
        onRename,
        onDelete,
      );
      details.appendChild(subContainer);

      container.appendChild(details);
    } else {
      const { files } = entry;
      for (const file of files) {
        const fileDiv = document.createElement("div");
        fileDiv.className = "tree-file";
        fileDiv.style.paddingLeft = `${level * 20}px`;

        const downloadUrl = `/manage/download/${file.id}?userId=${authData.userId}&signature=${authData.signature}&expiresAt=${authData.expiresAt}`;

        const link = document.createElement("a");
        link.href = downloadUrl;
        link.textContent = file.name;
        link.className = "tree-file-link";
        link.download = file.name;

        const renameBtn = document.createElement("button");
        renameBtn.className = "tree-file-rename btn-xs";
        renameBtn.textContent = "✎";
        renameBtn.title = "Rename/move file";
        renameBtn.setAttribute("aria-label", `Rename/move ${file.name}`);
        renameBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onRename(file.id, file.path, file.name);
        };

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "tree-file-delete btn-xs";
        deleteBtn.textContent = "✕";
        deleteBtn.title = "Delete file";
        deleteBtn.setAttribute("aria-label", `Delete ${file.name}`);
        deleteBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(file.id, file.name);
        };

        fileDiv.appendChild(link);
        fileDiv.appendChild(renameBtn);
        fileDiv.appendChild(deleteBtn);
        container.appendChild(fileDiv);
      }
    }
  }
}

/**
 * Expands all directory details elements in the file tree and saves state.
 *
 * @param tree - The directory tree to expand all paths from
 */
export function expandAll(tree: DirectoryTree): void {
  const allDetails = document.querySelectorAll("#file-tree details");
  allDetails.forEach((detail) => {
    (detail as HTMLDetailsElement).open = true;
  });

  const allPaths = getAllTreePaths(tree);
  saveExpandedDirectories(allPaths);
}

/**
 * Collapses all directory details elements in the file tree and clears state.
 */
export function collapseAll(): void {
  const allDetails = document.querySelectorAll("#file-tree details");
  allDetails.forEach((detail) => {
    (detail as HTMLDetailsElement).open = false;
  });

  saveExpandedDirectories(new Set());
}
