import { expect, test } from "@playwright/test";
import { completeMockLogin } from "../support/login.ts";

/**
 * The single long, stateful journey (specs/2026-08-26-web-e2e-acceptance-test-harness.md
 * §4) is built up step by step. This is currently just steps 1-2 (phase 4:
 * harness scaffolding) -- confirming all three processes actually boot
 * together, the built app loads against them logged out, and a real PKCE
 * login round trip through a real browser works end to end. The rest of
 * the 22-step outline lands in phase 5.
 */
test("the full app journey", async ({ page }) => {
  await test.step("cold start, logged out -> auto-redirects to login", async () => {
    // Auth0.ts's resource calls loginWithRedirect() itself as soon as it
    // resolves an unauthenticated session -- there's no stable "logged out"
    // page to land on and click a button from; the real app redirects
    // before a user could click anything. The fallback "Log In" button only
    // exists for the (here, unreachable) case where that redirect fails.
    await page.goto("/");
    await page.waitForURL((url) => url.pathname === "/authorize");
  });

  await test.step("login (real PKCE round trip)", async () => {
    await completeMockLogin(page);
    await expect(page).toHaveURL("/");
    await expect(page.locator("header img")).toBeVisible();
  });
});
