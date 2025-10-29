/**
 * Validates a filename for rename/move operations.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateFilename(newName: string, allowedExtensions: string[]): string | null {
  if (!newName) {
    return "Please enter a new filename";
  }

  if (/[<>:"|?*]/.test(newName)) {
    return 'Filename cannot contain: < > : " | ? *';
  }

  for (let i = 0; i < newName.length; i++) {
    if (newName.charCodeAt(i) < 32) {
      return "Filename cannot contain special characters";
    }
  }

  if (newName === "." || newName === "..") {
    return 'Filename cannot be "." or ".."';
  }

  if (newName.startsWith(".")) {
    return 'Filename cannot start with "."';
  }

  if (newName.length > 255) {
    return "Filename cannot exceed 255 characters";
  }

  const fileExtension = newName.substring(newName.lastIndexOf(".")).toLowerCase();
  const normalizedAllowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());

  if (!normalizedAllowedExtensions.includes(fileExtension)) {
    const allowedList = allowedExtensions.join(", ");
    return `File extension ${fileExtension} is not allowed. Allowed extensions: ${allowedList}`;
  }

  return null;
}

/**
 * Validates that the target filename doesn't already exist in the directory.
 * Returns null if valid (file doesn't exist), or an error message if file exists.
 */
export function validateNoExistingFile(
  newName: string,
  existingFilesInDirectory: string[],
): string | null {
  const normalizedNewName = newName.toLowerCase();
  const normalizedExisting = existingFilesInDirectory.map((name) => name.toLowerCase());

  if (normalizedExisting.includes(normalizedNewName)) {
    return "A file with that name already exists";
  }

  return null;
}
