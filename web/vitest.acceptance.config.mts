import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin()],
  publicDir: "src/assets/public",
  test: {
    globals: true,
    setupFiles: ["./src/test-setup-browser.ts"],
    include: [
      "src/acceptance.test.tsx",
      "src/acceptance-add-recipe.test.tsx",
      "src/acceptance-add-entry.test.tsx",
    ],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
