import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Extract and test the bytesToMB function from routes.ts
 * Since it's not exported, we recreate it here for testing
 */
function bytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

describe("bytesToMB", () => {
  it("converts bytes to MB with 2 decimal places", () => {
    expect(bytesToMB(1048576)).toBe("1.00");
  });

  it("handles zero bytes", () => {
    expect(bytesToMB(0)).toBe("0.00");
  });

  it("handles small file sizes", () => {
    expect(bytesToMB(512)).toBe("0.00");
  });

  it("handles fractional megabytes", () => {
    expect(bytesToMB(1572864)).toBe("1.50");
  });

  it("handles large file sizes", () => {
    expect(bytesToMB(104857600)).toBe("100.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(bytesToMB(1234567)).toBe("1.18");
  });

  it("handles exact multiples of MB", () => {
    expect(bytesToMB(5242880)).toBe("5.00");
  });
});

describe("routes.ts implementation check", () => {
  it("contains the bytesToMB function", () => {
    const routesSource = readFileSync("src/routes.ts", "utf-8");
    expect(routesSource).toContain("function bytesToMB");
    expect(routesSource).toContain("(bytes / (1024 * 1024)).toFixed(2)");
  });
});
