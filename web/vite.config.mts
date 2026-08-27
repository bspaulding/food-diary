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
// The E2E acceptance test harness runs a single mock server standing in for
// both Hasura and llm-nutrition-api (serving /v1/graphql, /lookup, /upload
// at its root, same as the real services do once Vite strips the /api,
// /llm, /labeller prefixes below). When set, it takes priority over the
// two flags above for all three proxy targets -- this is the one thing the
// harness injects to point the built app at the mock backend; `vite
// preview` reuses this same `server.proxy` config (Vite falls back to it
// when `preview.proxy` isn't set separately), so no application code needs
// to know about it.
const mockServerUrl = process.env.FOOD_DIARY_MOCK_SERVER_URL;
// The E2E harness serves the app over plain HTTP (mock servers run on
// localhost, which Chromium treats as a secure context on its own) and
// needs to disable this self-signed-cert plugin to do so.
const useHttps: boolean = process.env.FOOD_DIARY_HTTPS !== "false";
console.log({
  useLocalHasura,
  useLocalLlmNutritionApi,
  mockServerUrl,
  useHttps,
});

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin(), ...(useHttps ? [basicSsl()] : [])],
  publicDir: "src/assets/public",
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target:
          mockServerUrl ??
          (useLocalHasura
            ? "http://localhost:8080/"
            : "https://food-diary.motingo.com/api/"),
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
      },
      "/labeller": {
        target:
          mockServerUrl ??
          (useLocalLlmNutritionApi
            ? "http://localhost:3030"
            : "https://food-diary.motingo.com/labeller/"),
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/labeller/, ""),
      },
      "/llm": {
        target:
          mockServerUrl ??
          (useLocalLlmNutritionApi
            ? "http://localhost:3030"
            : "https://food-diary.motingo.com/llm/"),
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
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/acceptance*.test.*",
      "e2e/**",
    ],
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
        lines: 96,
        functions: 96,
        branches: 79,
        statements: 96,
      },
    },
  },
});
