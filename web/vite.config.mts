import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";

const useLocalHasura: boolean =
  process.env.FOOD_DIARY_USE_LOCAL_HASURA === "true";
// nutrition-fact-labeller and llm-nutrition-api were merged into one Zig
// service (llm-nutrition-api) exposing both /upload and /lookup, so one
// flag now controls both proxy targets below instead of two independent
// ones.
const useLocalLlmNutritionApi: boolean =
  process.env.FOOD_DIARY_USE_LOCAL_LLM_NUTRITION_API === "true";
console.log({ useLocalHasura, useLocalLlmNutritionApi });

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin(), basicSsl()],
  publicDir: "src/assets/public",
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target: useLocalHasura
          ? "http://localhost:8080/"
          : "https://food-diary.motingo.com/api/",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
      },
      "/labeller": {
        target: useLocalLlmNutritionApi
          ? "http://localhost:3030"
          : "https://food-diary.motingo.com/labeller/",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/labeller/, ""),
      },
      "/llm": {
        target: useLocalLlmNutritionApi
          ? "http://localhost:3030"
          : "https://food-diary.motingo.com/llm/",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/llm/, ""),
      },
    },
  },
  build: {
    target: "esnext",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/acceptance*.test.*"],
    browser: {
      enabled: false, // Can be enabled when browser providers are installed
      instances: [{ browser: "chromium" }],
    },
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test-setup.ts",
        "src/test-setup-browser.ts",
        "src/acceptance*.test.{ts,tsx}",
        "src/assets/**",
      ],
      thresholds: {
        lines: 93,
        functions: 95,
        branches: 74,
        statements: 93,
      },
    },
  },
});
