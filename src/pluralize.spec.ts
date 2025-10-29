import { expect, it } from "vitest";
import { pluralize } from "./pluralize.js";

it("returns singular form when count is 1", () => {
  expect(pluralize(1, "apple")).toBe("apple");
  expect(pluralize(1, "character")).toBe("character");
  expect(pluralize(1, "download")).toBe("download");
});

it("returns plural form when count is 0", () => {
  expect(pluralize(0, "apple")).toBe("apples");
  expect(pluralize(0, "file")).toBe("files");
});

it("returns plural form when count is greater than 1", () => {
  expect(pluralize(2, "apple")).toBe("apples");
  expect(pluralize(5, "character")).toBe("characters");
  expect(pluralize(100, "download")).toBe("downloads");
});

it("uses custom plural form when provided", () => {
  expect(pluralize(0, "child", "children")).toBe("children");
  expect(pluralize(2, "child", "children")).toBe("children");
  expect(pluralize(1, "child", "children")).toBe("child");
});

it("handles irregular plurals", () => {
  expect(pluralize(0, "person", "people")).toBe("people");
  expect(pluralize(1, "person", "people")).toBe("person");
  expect(pluralize(5, "person", "people")).toBe("people");
});

it("defaults to adding 's' for plural", () => {
  expect(pluralize(0, "cat")).toBe("cats");
  expect(pluralize(2, "dog")).toBe("dogs");
});

it("works with negative counts", () => {
  expect(pluralize(-1, "apple")).toBe("apples");
  expect(pluralize(-5, "file")).toBe("files");
});

it("works with decimal counts", () => {
  expect(pluralize(0.5, "apple")).toBe("apples");
  expect(pluralize(1.5, "file")).toBe("files");
  expect(pluralize(1.0, "download")).toBe("download");
});
