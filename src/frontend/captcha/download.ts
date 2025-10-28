/**
 * Extracts the filename from a Content-Disposition header.
 * Handles various formats including quoted filenames and RFC 5987 encoding.
 *
 * @param contentDisposition - The Content-Disposition header value
 * @returns The extracted filename, or "download" if extraction fails
 */
export function extractFilenameFromHeader(contentDisposition: string | null): string {
  if (!contentDisposition) {
    return "download";
  }

  const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
  if (matches?.[1]) {
    return matches[1].replace(/['"]/g, "");
  }

  return "download";
}

/**
 * Triggers a browser download of a Blob by creating a temporary anchor element.
 * The blob URL and anchor are automatically cleaned up after the download starts.
 *
 * @param blob - The data to download
 * @param filename - Optional filename for the download (defaults to "download")
 */
export function triggerBrowserDownload(blob: Blob, filename?: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}
