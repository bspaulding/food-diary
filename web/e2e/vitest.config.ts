import { defineConfig } from "vitest/config";

/**
 * Unit tests for the E2E harness's own mock servers -- deliberately
 * separate from the app's main vite.config.mts test config (which is
 * jsdom-based and coverage-gated for src/**). These are plain Node HTTP
 * servers with no DOM and no coverage requirement of their own.
 */
export default defineConfig({
  // Vitest's default root is the invoking process's cwd, not this config
  // file's directory -- pin it explicitly so `include` below resolves
  // correctly regardless of where `--config e2e/vitest.config.ts` is run
  // from.
  root: import.meta.dirname,
  test: {
    globals: true,
    environment: "node",
    include: ["servers/**/*.test.ts"],
  },
});
