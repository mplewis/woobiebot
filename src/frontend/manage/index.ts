import type { AuthData, DirectoryTree } from "../../shared/types.js";
import { fetchManageData } from "./api.js";
import {
  getCurrentDeleteFileName,
  handleDeleteFile,
  hideDeleteModal,
  showDeleteModal,
} from "./delete.js";
import { cleanupDeletedDirectories } from "./directoryState.js";
import { handleRename, openRenameBox, showRenameStatus, updateRenameButton } from "./rename.js";
import { collapseAll, expandAll, renderDirectoryTree } from "./render.js";
import { filterTree } from "./search.js";
import { handleUpload, openUploadBox } from "./upload.js";

/**
 * Authentication credentials for API requests.
 */
let AUTH_DATA: AuthData;

/**
 * Complete directory tree structure containing all indexed files.
 */
let DIRECTORY_TREE: DirectoryTree;

/**
 * List of allowed file extensions for uploads (e.g., ['.pdf', '.txt']).
 */
let ALLOWED_EXTENSIONS: string[] = [];

/**
 * Maximum allowed file size in megabytes.
 */
let MAX_FILE_SIZE_MB = 0;

/**
 * Displays a status message with the specified type.
 *
 * @param message - The status message to display
 * @param type - The message type determining the visual style
 */
export function showStatus(message: string, type: "info" | "error" | "success"): void {
  const status = document.getElementById("status") as HTMLDivElement;
  status.textContent = message;
  status.className = `status ${type}`;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const manageData = await fetchManageData();

    AUTH_DATA = {
      userId: manageData.userId,
      signature: manageData.signature,
      expiresAt: manageData.expiresAt,
    };
    DIRECTORY_TREE = manageData.directoryTree;
    ALLOWED_EXTENSIONS = manageData.allowedExtensions;
    MAX_FILE_SIZE_MB = manageData.maxFileSizeMB;

    const form = document.getElementById("upload-form") as HTMLFormElement;
    form.addEventListener("submit", (e) =>
      handleUpload(e, AUTH_DATA, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB, showStatus),
    );

    const fileInput = document.getElementById("file") as HTMLInputElement;
    fileInput.setAttribute("accept", ALLOWED_EXTENSIONS.join(","));

    const fileLabel = document.querySelector('label[for="file"]') as HTMLLabelElement;
    if (fileLabel) {
      const extensionsDisplay = ALLOWED_EXTENSIONS.join(", ");
      fileLabel.textContent = `Select file (${manageData.maxFileSizeMB} MB max, ${extensionsDisplay})`;
    }

    const fileTreeContainer = document.getElementById("file-tree") as HTMLDivElement;
    cleanupDeletedDirectories(DIRECTORY_TREE);
    renderDirectoryTree(
      DIRECTORY_TREE,
      fileTreeContainer,
      AUTH_DATA,
      0,
      [],
      openUploadBox,
      (fileId, filePath, fileName) =>
        openRenameBox(fileId, filePath, fileName, () =>
          updateRenameButton(DIRECTORY_TREE, ALLOWED_EXTENSIONS, showRenameStatus),
        ),
      showDeleteModal,
    );

    const expandAllBtn = document.getElementById("expand-all-btn") as HTMLButtonElement;
    const collapseAllBtn = document.getElementById("collapse-all-btn") as HTMLButtonElement;
    expandAllBtn.addEventListener("click", () => expandAll(DIRECTORY_TREE));
    collapseAllBtn.addEventListener("click", collapseAll);

    const searchInput = document.getElementById("search-input") as HTMLInputElement;
    const searchClearBtn = document.getElementById("search-clear-btn") as HTMLButtonElement;
    const searchBox = searchInput.parentElement as HTMLElement;

    searchInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const searchTerm = target.value;

      if (searchTerm.trim()) {
        searchBox.classList.add("has-text");
      } else {
        searchBox.classList.remove("has-text");
      }

      filterTree(searchTerm);
    });

    searchClearBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchBox.classList.remove("has-text");
      filterTree("");
      searchInput.focus();
    });

    const deleteConfirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;
    const deleteConfirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
    const deleteCancelBtn = document.getElementById("delete-cancel-btn") as HTMLButtonElement;

    deleteConfirmInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      deleteConfirmBtn.disabled = target.value.trim() !== getCurrentDeleteFileName();
    });

    deleteConfirmBtn.addEventListener("click", () => handleDeleteFile(AUTH_DATA, showStatus));
    deleteCancelBtn.addEventListener("click", hideDeleteModal);

    const deleteModal = document.getElementById("delete-modal") as HTMLDivElement;
    deleteModal.addEventListener("click", (e) => {
      if (e.target === deleteModal) {
        hideDeleteModal();
      }
    });

    const renameForm = document.getElementById("rename-form") as HTMLFormElement;
    const newPathInput = document.getElementById("new-path") as HTMLInputElement;
    const newNameInput = document.getElementById("new-name") as HTMLInputElement;

    renameForm.addEventListener("submit", (e) => handleRename(e, AUTH_DATA, ALLOWED_EXTENSIONS));

    newPathInput.addEventListener("input", () =>
      updateRenameButton(DIRECTORY_TREE, ALLOWED_EXTENSIONS, showRenameStatus),
    );
    newNameInput.addEventListener("input", () =>
      updateRenameButton(DIRECTORY_TREE, ALLOWED_EXTENSIONS, showRenameStatus),
    );
  } catch (error) {
    console.error("Failed to load manage data:", error);
    showStatus(
      `Failed to load page data: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
  }
});
