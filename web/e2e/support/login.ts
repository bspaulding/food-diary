import type { Page } from "@playwright/test";

export type LoginOptions = {
  /** Overrides the login form's default email, letting a test assert on
   * whichever identity is currently logged in. */
  email?: string;
  /** Requests a short-lived token for this login only (real, visible field
   * on the login form) -- see mock-auth-server/loginPage.ts. */
  ttlSeconds?: number;
};

/**
 * Drives the mock auth server's real HTML login form. Call this once the
 * browser has already navigated there (via clicking the app's "Log In"
 * button, or any other real trigger of `loginWithRedirect()`) -- this
 * helper doesn't trigger the navigation itself, since that varies by
 * scenario (first login, re-login after logout, etc).
 */
export async function completeMockLogin(
  page: Page,
  options: LoginOptions = {},
): Promise<void> {
  await page.waitForSelector('form[action="/authorize"]');
  if (options.email) {
    await page.fill('input[name="email"]', options.email);
  }
  if (options.ttlSeconds) {
    await page.fill('input[name="ttl"]', String(options.ttlSeconds));
  }
  await page.click('button[type="submit"]');
}
