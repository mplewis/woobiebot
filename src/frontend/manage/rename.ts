import type { AuthData, DirectoryTree, RenameResponse } from "../../shared/types.js";
import { validateFilename } from "../../validation.js";
import {
  determineRenameOperation,
  extractDirectoryPath,
  getFilesInDirectory,
} from "./validation.js";

/**
 * ID of the file currently selected for rename/move (null if no file is selected).
 */
let currentRenameFileId: string | null = null;

/**
 * Path of the file currently selected for rename/move.
 */
let currentRenameFilePath = "";

/**
 * Name of the file currently selected for rename/move.
 */
let currentRenameFileName = "";

/**
 * Opens the rename form and pre-fills it with the current file information.
 * Scrolls smoothly to the rename section and focuses the new name input.
 *
 * @param fileId - ID of the file to rename/move
 * @param filePath - Current path of the file
 * @param fileName - Current name of the file
 * @param onUpdate - Callback function to update the rename button state
 */
export function openRenameBox(
  fileId: string,
  filePath: string,
  fileName: string,
  onUpdate: () => void,
): void {
  currentRenameFileId = fileId;
  currentRenameFilePath = filePath;
  currentRenameFileName = fileName;

  const currentPath = extractDirectoryPath(filePath);

  const currentPathInput = document.getElementById("current-path") as HTMLInputElement;
  const currentNameInput = document.getElementById("current-name") as HTMLInputElement;
  const newPathInput = document.getElementById("new-path") as HTMLInputElement;
  const newNameInput = document.getElementById("new-name") as HTMLInputElement;

  currentPathInput.value = currentPath || "/";
  currentNameInput.value = fileName;
  newPathInput.value = currentPath;
  newNameInput.value = fileName;

  const renameSection = document.getElementById("rename-section") as HTMLDivElement;
  renameSection.scrollIntoView({ behavior: "smooth", block: "start" });

  setTimeout(() => {
    newNameInput.focus();
    newNameInput.select();
  }, 500);

  onUpdate();
}

/**
 * Updates the rename button text and disabled state based on form values.
 * Also validates the filename and shows errors in real-time.
 *
 * @param tree - The directory tree to check for existing files
 * @param allowedExtensions - List of allowed file extensions
 * @param showRenameStatus - Callback function to display status messages
 */
export function updateRenameButton(
  tree: DirectoryTree,
  allowedExtensions: string[],
  showRenameStatus: (message: string, type: "info" | "error" | "success") => void,
): void {
  const newPathInput = document.getElementById("new-path") as HTMLInputElement;
  const newNameInput = document.getElementById("new-name") as HTMLInputElement;
  const renameBtn = document.getElementById("rename-btn") as HTMLButtonElement;

  const currentPath = extractDirectoryPath(currentRenameFilePath);
  const newPath = newPathInput.value.trim();
  const newName = newNameInput.value.trim();

  const targetPath = newPath || "";
  const filesInTargetDir = getFilesInDirectory(targetPath, tree);

  const result = determineRenameOperation(
    currentPath,
    currentRenameFileName,
    newPath,
    newName,
    allowedExtensions,
    filesInTargetDir,
  );

  renameBtn.disabled = result.disabled;
  renameBtn.textContent = result.buttonText;
  showRenameStatus(result.statusMessage, result.statusType);
}

/**
 * Displays a status message in the rename section with the specified type.
 *
 * @param message - The status message to display
 * @param type - The message type determining the visual style
 */
export function showRenameStatus(message: string, type: "info" | "error" | "success"): void {
  const status = document.getElementById("rename-status") as HTMLDivElement;
  status.textContent = message;
  status.className = `status ${type}`;
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "polite");

  if (message) {
    status.style.display = "";
  } else {
    status.style.display = "none";
  }
}

/**
 * Handles rename/move form submission.
 * Sends rename/move request to the server and refreshes on success.
 *
 * @param event - The form submit event
 * @param authData - Authentication data for the rename request
 * @param allowedExtensions - List of allowed file extensions
 */
export async function handleRename(
  event: Event,
  authData: AuthData,
  allowedExtensions: string[],
): Promise<void> {
  event.preventDefault();

  if (!currentRenameFileId) {
    return;
  }

  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const renameBtn = document.getElementById("rename-btn") as HTMLButtonElement;
  const newNameInput = document.getElementById("new-name") as HTMLInputElement;

  const newName = newNameInput.value.trim();

  const validationError = validateFilename(newName, allowedExtensions);
  if (validationError) {
    showRenameStatus(validationError, "error");
    return;
  }

  formData.append("fileId", currentRenameFileId);
  formData.append("userId", authData.userId);
  formData.append("signature", authData.signature);
  formData.append("expiresAt", authData.expiresAt.toString());

  renameBtn.disabled = true;
  const originalText = renameBtn.textContent;
  renameBtn.textContent = originalText === "Move" ? "Moving..." : "Renaming...";
  showRenameStatus(originalText === "Move" ? "Moving file..." : "Renaming file...", "info");

  try {
    const response = await fetch("/manage/rename", {
      method: "POST",
      body: formData,
    });

    const result = (await response.json()) as RenameResponse;

    if (response.ok) {
      showRenameStatus(
        `${result.message || "Operation completed"} Refreshing file list...`,
        "success",
      );
      form.reset();
      window.location.reload();
    } else {
      showRenameStatus(`Operation failed: ${result.error || "Unknown error"}`, "error");
      renameBtn.disabled = false;
      renameBtn.textContent = originalText;
    }
  } catch (error) {
    showRenameStatus(
      `Operation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
    renameBtn.disabled = false;
    renameBtn.textContent = originalText;
  }
}
