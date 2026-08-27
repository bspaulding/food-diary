import { defineConfig, devices } from "@playwright/test";

const AUTH_PORT = 4300;
const API_PORT = 4200;
const WEB_PORT = 5173;

export default defineConfig({
  testDir: "./tests",
  // One long journey covering the whole app, including a real ~80s wait
  // for a short-lived token to expire (see the "session expiry" step) --
  // comfortably past Playwright's 30s per-test default.
  timeout: 300_000,
  // Playwright's outputDir/reporter default to paths relative to the
  // invoking process's cwd (web/), not this config file's directory --
  // pin them explicitly so run artifacts land under e2e/ alongside
  // everything else instead of scattering into web/.
  outputDir: "./test-results",
  reporter: [["html", { outputFolder: "./playwright-report", open: "never" }]],
  fullyParallel: false, // one long, stateful journey
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Real synthetic camera/mic streams for CameraModal's "Take
        // Picture" tab -- no real hardware, no OS permission prompts.
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
        permissions: ["camera"],
      },
    },
  ],
  webServer: [
    {
      command: "npx tsx servers/mock-auth-server/index.ts",
      port: AUTH_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(AUTH_PORT) },
    },
    {
      command: "npx tsx servers/mock-api-server/index.ts",
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(API_PORT) },
    },
    {
      // Not `npm run serve` (today's `vite preview` alias) -- invoke vite
      // directly so the E2E-only port/env don't leak into that script.
      // Building fresh each run (rather than reusing a stale dist/) is
      // deliberate: this suite exists to verify the real production build.
      command: `npx vite build && npx vite preview --port ${WEB_PORT} --strictPort`,
      cwd: "..",
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        FOOD_DIARY_HTTPS: "false",
        FOOD_DIARY_MOCK_SERVER_URL: `http://localhost:${API_PORT}`,
        VITE_AUTH0_DOMAIN: `http://localhost:${AUTH_PORT}`,
        VITE_AUTH0_CLIENT_ID: "e2e-test-client",
      },
    },
  ],
});
