import { fileMatchesSearch, normalizeSearchTerm } from "./validation.js";

/**
 * Filters the file tree to show only files and directories that match the search term.
 * Files are matched by full path (case-insensitive substring match).
 * Directories are shown if they contain any matching files or subdirectories.
 *
 * @param searchTerm - The search term to filter by (case-insensitive)
 */
export function filterTree(searchTerm: string): void {
  const normalizedSearch = normalizeSearchTerm(searchTerm);
  const allFiles = document.querySelectorAll("#file-tree .tree-file");
  const allDetails = document.querySelectorAll("#file-tree details");

  if (normalizedSearch === "") {
    allFiles.forEach((file) => {
      file.classList.remove("hidden");
    });
    allDetails.forEach((detail) => {
      detail.classList.remove("hidden");
    });
    return;
  }

  allFiles.forEach((file) => {
    const fileLink = file.querySelector(".tree-file-link") as HTMLAnchorElement;
    if (fileLink) {
      const filePath = fileLink.dataset.filePath || "";
      if (fileMatchesSearch(filePath, normalizedSearch)) {
        file.classList.remove("hidden");
      } else {
        file.classList.add("hidden");
      }
    }
  });

  allDetails.forEach((detail) => {
    const hasVisibleChildren = (element: HTMLElement): boolean => {
      const childFiles = element.querySelectorAll(":scope > div > .tree-file");
      const childDetails = element.querySelectorAll(":scope > div > details");

      const hasVisibleFile = Array.from(childFiles).some(
        (file) => !file.classList.contains("hidden"),
      );

      const hasVisibleSubdir = Array.from(childDetails).some((child) => {
        return !child.classList.contains("hidden") && hasVisibleChildren(child as HTMLElement);
      });

      return hasVisibleFile || hasVisibleSubdir;
    };

    if (hasVisibleChildren(detail as HTMLElement)) {
      detail.classList.remove("hidden");
      (detail as HTMLDetailsElement).open = true;
    } else {
      detail.classList.add("hidden");
    }
  });
}
