import type {
  AuthData,
  DeleteResponse,
  DirectoryTree,
  FileMetadata,
  ManagePageData,
  UploadResponse,
} from "../../shared/types.js";

declare global {
  interface Window {
    __MANAGE_DATA__: ManagePageData;
  }
}

/**
 * Authentication credentials for API requests, extracted from server-injected page data.
 */
const AUTH_DATA: AuthData = {
  userId: window.__MANAGE_DATA__.userId,
  token: window.__MANAGE_DATA__.token,
  signature: window.__MANAGE_DATA__.signature,
  expiresAt: window.__MANAGE_DATA__.expiresAt,
};

/**
 * Complete directory tree structure containing all indexed files.
 */
const DIRECTORY_TREE = window.__MANAGE_DATA__.directoryTree;

/**
 * ID of the file currently selected for deletion (null if no file is selected).
 */
let currentDeleteFileId: string | null = null;

/**
 * Name of the file currently selected for deletion (null if no file is selected).
 */
let currentDeleteFileName: string | null = null;

/**
 * Opens the upload form and pre-fills the directory path input.
 * Scrolls smoothly to the upload section and focuses the directory input.
 *
 * @param directoryPath - The directory path to pre-fill in the upload form
 */
function openUploadBox(directoryPath: string): void {
  const directoryInput = document.getElementById("directory") as HTMLInputElement;

  directoryInput.value = directoryPath;

  const uploadSection = document.getElementById("upload-section") as HTMLDivElement;
  uploadSection.scrollIntoView({ behavior: "smooth", block: "start" });

  setTimeout(() => {
    directoryInput.focus();
  }, 500);
}

/**
 * Recursively renders the directory tree structure into DOM elements.
 * Creates expandable directory entries with upload buttons and file entries with download links.
 * Directories are sorted alphabetically, as are files within each directory.
 *
 * @param tree - The directory tree structure to render
 * @param container - The HTML element to render the tree into
 * @param level - Current nesting level for indentation (defaults to 0)
 * @param parentPath - Array of parent directory names for building full paths (defaults to empty)
 */
function renderDirectoryTree(
  tree: DirectoryTree,
  container: HTMLElement,
  level: number = 0,
  parentPath: string[] = [],
): void {
  if (!tree || Object.keys(tree).length === 0) {
    container.innerHTML = '<div class="tree-empty">No files indexed yet</div>';
    return;
  }

  const entries = Object.entries(tree);
  const fileEntry = entries.find(([key]) => key === "_files");
  const dirEntries = entries
    .filter(([key]) => key !== "_files")
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [key, value] of dirEntries) {
    const details = document.createElement("details");
    details.open = level === 0;
    details.style.paddingLeft = `${level * 20}px`;

    const summary = document.createElement("summary");
    summary.className = "tree-dir";

    const icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.textContent = "▶";

    const folderName = document.createElement("span");
    folderName.className = "tree-dir-name";
    folderName.textContent = key;

    const uploadBtn = document.createElement("button");
    uploadBtn.className = "tree-upload-btn";
    uploadBtn.textContent = "↑";
    uploadBtn.title = "Upload to this folder";
    uploadBtn.setAttribute("aria-label", `Upload to ${key} folder`);
    uploadBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fullPath = [...parentPath, key].join("/");
      openUploadBox(fullPath);
    };

    summary.appendChild(icon);
    summary.appendChild(folderName);
    summary.appendChild(uploadBtn);

    details.appendChild(summary);

    const subContainer = document.createElement("div");
    renderDirectoryTree(value as DirectoryTree, subContainer, level + 1, [...parentPath, key]);
    details.appendChild(subContainer);

    container.appendChild(details);
  }

  if (fileEntry) {
    const [, files] = fileEntry;
    const sortedFiles = [...(files as FileMetadata[])].sort((a, b) => a.name.localeCompare(b.name));

    for (const file of sortedFiles) {
      const fileDiv = document.createElement("div");
      fileDiv.className = "tree-file";
      fileDiv.style.paddingLeft = `${level * 20}px`;

      const downloadUrl = `/manage/download/${file.id}?userId=${AUTH_DATA.userId}&signature=${AUTH_DATA.signature}&expiresAt=${AUTH_DATA.expiresAt}`;

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.textContent = file.name;
      link.className = "tree-file-link";
      link.download = file.name;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "tree-file-delete";
      deleteBtn.textContent = "✕";
      deleteBtn.title = "Delete file";
      deleteBtn.setAttribute("aria-label", `Delete ${file.name}`);
      deleteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDeleteModal(file.id, file.name);
      };

      fileDiv.appendChild(link);
      fileDiv.appendChild(deleteBtn);
      container.appendChild(fileDiv);
    }
  }
}

/**
 * Displays a status message with the specified type.
 *
 * @param message - The status message to display
 * @param type - The message type determining the visual style
 */
function showStatus(message: string, type: "info" | "error" | "success"): void {
  const status = document.getElementById("status") as HTMLDivElement;
  status.textContent = message;
  status.className = `status ${type}`;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
}

/**
 * Handles file upload form submission.
 * Appends authentication data to the form, submits to the server, and refreshes on success.
 *
 * @param event - The form submit event
 */
async function handleUpload(event: Event): Promise<void> {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const uploadBtn = document.getElementById("upload-btn") as HTMLButtonElement;

  formData.append("userId", AUTH_DATA.userId);
  formData.append("token", AUTH_DATA.token);
  formData.append("signature", AUTH_DATA.signature);
  formData.append("expiresAt", AUTH_DATA.expiresAt.toString());

  uploadBtn.disabled = true;
  showStatus("Uploading file...", "info");

  try {
    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const result = (await response.json()) as UploadResponse;

    if (response.ok) {
      showStatus("File uploaded successfully! Refreshing file list...", "success");
      form.reset();

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showStatus(`Upload failed: ${result.error || "Unknown error"}`, "error");
      uploadBtn.disabled = false;
    }
  } catch (error) {
    showStatus(
      `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
    uploadBtn.disabled = false;
  }
}

/**
 * Shows the delete confirmation modal for a specific file.
 * Stores the file ID and name in module-level state for later deletion.
 *
 * @param fileId - ID of the file to delete
 * @param fileName - Name of the file to delete (used for confirmation)
 */
function showDeleteModal(fileId: string, fileName: string): void {
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
function hideDeleteModal(): void {
  const modal = document.getElementById("delete-modal") as HTMLDivElement;
  modal.classList.remove("show");
  currentDeleteFileId = null;
  currentDeleteFileName = null;
}

/**
 * Handles the confirmed deletion of a file.
 * Sends a DELETE request to the server and refreshes the page on success.
 */
async function handleDeleteFile(): Promise<void> {
  if (!currentDeleteFileId) {
    return;
  }

  const confirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Deleting...";

  try {
    const deleteUrl = `/manage/delete/${currentDeleteFileId}?userId=${AUTH_DATA.userId}&signature=${AUTH_DATA.signature}&expiresAt=${AUTH_DATA.expiresAt}`;
    const response = await fetch(deleteUrl, {
      method: "DELETE",
    });

    const result = (await response.json()) as DeleteResponse;

    if (response.ok) {
      hideDeleteModal();
      showStatus("File deleted successfully! Refreshing file list...", "success");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showStatus(`Delete failed: ${result.error || "Unknown error"}`, "error");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Delete File";
    }
  } catch (error) {
    showStatus(
      `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Delete File";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("upload-form") as HTMLFormElement;
  form.addEventListener("submit", handleUpload);

  const fileTreeContainer = document.getElementById("file-tree") as HTMLDivElement;
  renderDirectoryTree(DIRECTORY_TREE, fileTreeContainer);

  const deleteConfirmInput = document.getElementById("delete-confirm-input") as HTMLInputElement;
  const deleteConfirmBtn = document.getElementById("delete-confirm-btn") as HTMLButtonElement;
  const deleteCancelBtn = document.getElementById("delete-cancel-btn") as HTMLButtonElement;

  deleteConfirmInput.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    deleteConfirmBtn.disabled = target.value.trim() !== currentDeleteFileName;
  });

  deleteConfirmBtn.addEventListener("click", handleDeleteFile);
  deleteCancelBtn.addEventListener("click", hideDeleteModal);

  const deleteModal = document.getElementById("delete-modal") as HTMLDivElement;
  deleteModal.addEventListener("click", (e) => {
    if (e.target === deleteModal) {
      hideDeleteModal();
    }
  });
});
