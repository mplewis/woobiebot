import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for test execution and coverage reporting.
 * Configures test environment, coverage thresholds, and file matching patterns.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.spec.ts"],
    environmentMatchGlobs: [["src/frontend/**/*.spec.ts", "jsdom"]],
    env: {
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "*.config.ts",
        "**/*.d.ts",
        "**/*.spec.ts",
        "templates/**",
        "src/index.ts",
        "src/bot.ts",
        "src/frontend/**/index.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
