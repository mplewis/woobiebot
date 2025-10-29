import type { ManagePageData } from "../../shared/types.js";

/**
 * Fetches manage page data from the API using parameters from the URL query string.
 */
export async function fetchManageData(): Promise<ManagePageData> {
  const params = new URLSearchParams(window.location.search);
  const response = await fetch(`/api/manage?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to load manage data");
  }

  return await response.json();
}
