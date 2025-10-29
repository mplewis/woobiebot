import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filterTree } from "./search.js";

describe("filterTree", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="file-tree">
        <div class="tree-file">
          <a class="tree-file-link">test.txt</a>
        </div>
        <div class="tree-file">
          <a class="tree-file-link">document.pdf</a>
        </div>
        <div class="tree-file">
          <a class="tree-file-link">another-test.txt</a>
        </div>
        <details>
          <summary>Folder</summary>
          <div>
            <div class="tree-file">
              <a class="tree-file-link">nested.txt</a>
            </div>
          </div>
        </details>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows all files when search is empty", () => {
    filterTree("");

    const allFiles = document.querySelectorAll("#file-tree .tree-file");
    allFiles.forEach((file) => {
      expect(file.classList.contains("hidden")).toBe(false);
    });
  });

  it("filters files by search term", () => {
    filterTree("test");

    const files = document.querySelectorAll("#file-tree .tree-file");
    const testFile = files[0];
    const documentFile = files[1];
    const anotherTestFile = files[2];

    expect(testFile.classList.contains("hidden")).toBe(false);
    expect(documentFile.classList.contains("hidden")).toBe(true);
    expect(anotherTestFile.classList.contains("hidden")).toBe(false);
  });

  it("is case-insensitive", () => {
    filterTree("TEST");

    const files = document.querySelectorAll("#file-tree .tree-file");
    const testFile = files[0];

    expect(testFile.classList.contains("hidden")).toBe(false);
  });

  it("opens directories with matching files", () => {
    filterTree("nested");

    const details = document.querySelector("#file-tree details") as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(details.classList.contains("hidden")).toBe(false);
  });

  it("hides directories with no matching files", () => {
    filterTree("nonexistent");

    const details = document.querySelector("#file-tree details") as HTMLDetailsElement;
    expect(details.classList.contains("hidden")).toBe(true);
  });

  it("handles nested directories with subdirectory visible children", () => {
    document.body.innerHTML = `
      <div id="file-tree">
        <details>
          <summary>Parent</summary>
          <div>
            <details>
              <summary>Subdirectory</summary>
              <div>
                <div class="tree-file">
                  <a class="tree-file-link">deep-match.txt</a>
                </div>
              </div>
            </details>
          </div>
        </details>
      </div>
    `;

    filterTree("deep-match");

    const parentDetails = document.querySelectorAll(
      "#file-tree > details",
    )[0] as HTMLDetailsElement;
    const subdirDetails = document.querySelectorAll(
      "#file-tree > details details",
    )[0] as HTMLDetailsElement;

    expect(parentDetails.classList.contains("hidden")).toBe(false);
    expect(subdirDetails.classList.contains("hidden")).toBe(false);
    expect(parentDetails.open).toBe(true);
    expect(subdirDetails.open).toBe(true);
  });
});
