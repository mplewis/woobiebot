import { expect, it } from "vitest";
import { logger } from "./logger.js";

it("creates a logger instance", () => {
  expect(logger).toBeDefined();
  expect(logger.info).toBeInstanceOf(Function);
  expect(logger.error).toBeInstanceOf(Function);
  expect(logger.debug).toBeInstanceOf(Function);
  expect(logger.warn).toBeInstanceOf(Function);
});
