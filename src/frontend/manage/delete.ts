import type { AuthData, DeleteResponse } from "../../shared/types.js";

/**
 * ID of the file currently selected for deletion (null if no file is selected).
 */
let currentDeleteFileId: string | null = null;

/**
 * Name of the file currently selected for deletion (null if no file is selected).
 */
let currentDeleteFileName: string | null = null;

/**
 * Shows the delete confirmation modal for a specific file.
 * Stores the file ID and name in module-level state for later deletion.
 *
 * @param fileId - ID of the file to delete
 * @param fileName - Name of the file to delete (used for confirmation)
 */
export function showDeleteModal(fileId: string, fileName: string): void {
  currentDeleteFileId = fileId;
  currentDeleteFileName = fileName;

  const modal = document.getElementById("delete-modal") as HTMLDivElement;
  const filenameSpan = document.getElementById("delete-filename") as HTMLSpanElement;
  const confirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;
  const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;

  filenameSpan.textContent = fileName;
  confirmInput.value = "";
  confirmInput.placeholder = fileName;
  confirmBtn.disabled = true;

  modal.classList.add("show");
  setTimeout(() => confirmInput.focus(), 100);
}

/**
 * Hides the delete confirmation modal and clears the stored file ID and name.
 */
export function hideDeleteModal(): void {
  const modal = document.getElementById("delete-modal") as HTMLDivElement;
  modal.classList.remove("show");
  currentDeleteFileId = null;
  currentDeleteFileName = null;
}

/**
 * Gets the current delete file name for validation purposes.
 */
export function getCurrentDeleteFileName(): string | null {
  return currentDeleteFileName;
}

/**
 * Handles the confirmed deletion of a file.
 * Sends a DELETE request to the server and refreshes the page on success.
 * Keeps the modal open and disabled during the deletion and refresh process.
 *
 * @param authData - Authentication data for the delete request
 * @param showStatus - Callback function to display status messages
 */
export async function handleDeleteFile(
  authData: AuthData,
  showStatus: (message: string, type: "info" | "error" | "success") => void,
): Promise<void> {
  if (!currentDeleteFileId) {
    return;
  }

  const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
  const cancelBtn = document.getElementById("delete-cancel-btn") as HTMLButtonElement;
  const confirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;

  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  confirmInput.disabled = true;
  confirmBtn.textContent = "Deleting...";

  try {
    const deleteUrl = `/manage/delete/${currentDeleteFileId}?userId=${authData.userId}&signature=${authData.signature}&expiresAt=${authData.expiresAt}`;
    const response = await fetch(deleteUrl, {
      method: "DELETE",
    });

    const result = (await response.json()) as DeleteResponse;

    if (response.ok) {
      confirmBtn.textContent = "Refreshing...";
      showStatus("File deleted successfully! Refreshing file list...", "success");
      window.location.reload();
    } else {
      showStatus(`Delete failed: ${result.error || "Unknown error"}`, "error");
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      confirmInput.disabled = false;
      confirmBtn.textContent = "Delete File";
    }
  } catch (error) {
    showStatus(
      `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    confirmInput.disabled = false;
    confirmBtn.textContent = "Delete File";
  }
}
