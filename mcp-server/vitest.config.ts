import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    typecheck: { tsconfig: "./tsconfig.test.json" },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      all: true,
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
