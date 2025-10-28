import { expect, it } from "vitest";
import { log } from "./logger.js";

it("creates a logger instance", () => {
  expect(log).toBeDefined();
  expect(log.info).toBeInstanceOf(Function);
  expect(log.error).toBeInstanceOf(Function);
  expect(log.debug).toBeInstanceOf(Function);
  expect(log.warn).toBeInstanceOf(Function);
});
