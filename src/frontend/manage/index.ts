import type {
  AuthData,
  DeleteResponse,
  DirectoryTree,
  ManagePageData,
  UploadResponse,
} from "../../shared/types.js";
import { isTreeEmpty, sortTreeEntries } from "./tree.js";

/**
 * Fetches manage page data from the API using parameters from the URL query string.
 */
async function fetchManageData(): Promise<ManagePageData> {
  const params = new URLSearchParams(window.location.search);
  const response = await fetch(`/api/manage?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to load manage data");
  }

  return await response.json();
}

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
  if (isTreeEmpty(tree)) {
    container.innerHTML = '<div class="tree-empty">No files indexed yet</div>';
    return;
  }

  const entries = sortTreeEntries(tree);

  for (const entry of entries) {
    if (entry.type === "directory") {
      const { name, value } = entry;
      const details = document.createElement("details");
      details.open = level === 0;
      details.style.paddingLeft = `${level * 20}px`;

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
      uploadBtn.className = "tree-upload-btn";
      uploadBtn.textContent = "↑";
      uploadBtn.title = "Upload to this folder";
      uploadBtn.setAttribute("aria-label", `Upload to ${name} folder`);
      uploadBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fullPath = [...parentPath, name].join("/");
        openUploadBox(fullPath);
      };

      folderContent.appendChild(icon);
      folderContent.appendChild(folderName);
      summary.appendChild(folderContent);
      summary.appendChild(uploadBtn);

      details.appendChild(summary);

      const subContainer = document.createElement("div");
      renderDirectoryTree(value, subContainer, level + 1, [...parentPath, name]);
      details.appendChild(subContainer);

      container.appendChild(details);
    } else {
      const { files } = entry;
      for (const file of files) {
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
  const fileInput = document.getElementById("file") as HTMLInputElement;

  if (!fileInput.files || fileInput.files.length === 0) {
    showStatus("Please select a file to upload", "error");
    return;
  }

  const file = fileInput.files[0];
  const fileName = file.name;
  const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  const normalizedAllowedExtensions = ALLOWED_EXTENSIONS.map((ext) => ext.toLowerCase());

  if (!normalizedAllowedExtensions.includes(fileExtension)) {
    const allowedList = ALLOWED_EXTENSIONS.join(", ");
    showStatus(`File type ${fileExtension} is not allowed. Allowed types: ${allowedList}`, "error");
    return;
  }

  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    showStatus(
      `File size ${fileSizeMB.toFixed(2)} MB exceeds maximum allowed size of ${MAX_FILE_SIZE_MB} MB`,
      "error",
    );
    return;
  }

  formData.append("userId", AUTH_DATA.userId);
  formData.append("signature", AUTH_DATA.signature);
  formData.append("expiresAt", AUTH_DATA.expiresAt.toString());

  uploadBtn.disabled = true;
  showStatus("Uploading file...", "info");

  try {
    const response = await fetch("/manage/upload", {
      method: "POST",
      body: formData,
    });

    const result = (await response.json()) as UploadResponse;

    if (response.ok) {
      showStatus("File uploaded successfully! Refreshing file list...", "success");
      form.reset();
      window.location.reload();
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
 * Keeps the modal open and disabled during the deletion and refresh process.
 */
async function handleDeleteFile(): Promise<void> {
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
    const deleteUrl = `/manage/delete/${currentDeleteFileId}?userId=${AUTH_DATA.userId}&signature=${AUTH_DATA.signature}&expiresAt=${AUTH_DATA.expiresAt}`;
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
    form.addEventListener("submit", handleUpload);

    const fileInput = document.getElementById("file") as HTMLInputElement;
    fileInput.setAttribute("accept", ALLOWED_EXTENSIONS.join(","));

    const fileLabel = document.querySelector('label[for="file"]') as HTMLLabelElement;
    if (fileLabel) {
      const extensionsDisplay = ALLOWED_EXTENSIONS.join(", ");
      fileLabel.textContent = `Select file (${manageData.maxFileSizeMB} MB max, ${extensionsDisplay})`;
    }

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
  } catch (error) {
    console.error("Failed to load manage data:", error);
    showStatus(
      `Failed to load page data: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error",
    );
  }
});
