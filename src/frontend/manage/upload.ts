import type { AuthData, UploadResponse } from "../../shared/types.js";
import { isAllowedFileExtension, validateFileSize } from "./validation.js";

/**
 * Opens the upload form and pre-fills the directory path input.
 * Scrolls smoothly to the upload section and focuses the directory input.
 *
 * @param directoryPath - The directory path to pre-fill in the upload form
 */
export function openUploadBox(directoryPath: string): void {
  const directoryInput = document.getElementById("directory") as HTMLInputElement;

  directoryInput.value = directoryPath;

  const uploadSection = document.getElementById("upload-section") as HTMLDivElement;
  uploadSection.scrollIntoView({ behavior: "smooth", block: "start" });

  setTimeout(() => {
    directoryInput.focus();
  }, 500);
}

/**
 * Handles file upload form submission.
 * Appends authentication data to the form, submits to the server, and refreshes on success.
 *
 * @param event - The form submit event
 * @param authData - Authentication data for the upload request
 * @param allowedExtensions - List of allowed file extensions
 * @param maxFileSizeMB - Maximum file size in megabytes
 * @param showStatus - Callback function to display status messages
 */
export async function handleUpload(
  event: Event,
  authData: AuthData,
  allowedExtensions: string[],
  maxFileSizeMB: number,
  showStatus: (message: string, type: "info" | "error" | "success") => void,
): Promise<void> {
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

  if (!isAllowedFileExtension(fileName, allowedExtensions)) {
    const allowedList = allowedExtensions.join(", ");
    const fileExtension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    showStatus(`File type ${fileExtension} is not allowed. Allowed types: ${allowedList}`, "error");
    return;
  }

  const sizeValidation = validateFileSize(file.size, maxFileSizeMB);
  if (!sizeValidation.valid) {
    showStatus(
      `File size ${sizeValidation.actualSizeMB.toFixed(2)} MB exceeds maximum allowed size of ${maxFileSizeMB} MB`,
      "error",
    );
    return;
  }

  formData.append("userId", authData.userId);
  formData.append("signature", authData.signature);
  formData.append("expiresAt", authData.expiresAt.toString());

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
