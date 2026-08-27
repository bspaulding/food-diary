const HIDDEN_PARAMS = [
  "client_id",
  "redirect_uri",
  "state",
  "nonce",
  "code_challenge",
  "code_challenge_method",
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A real, if minimal, HTML form -- so the Playwright driver fills an input
 * and clicks a button rather than the mock silently auto-approving, per the
 * plan's "drive a real login interaction" requirement. Re-posts every
 * `/authorize` query param verbatim as hidden fields so the POST handler
 * has everything it needs to mint a code.
 */
export function renderLoginPage(params: URLSearchParams): string {
  const hidden = HIDDEN_PARAMS.map(
    (name) =>
      `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name) ?? "")}" />`,
  ).join("\n      ");

  return `<!doctype html>
<html>
  <head><title>Mock Auth0 Login</title></head>
  <body>
    <h1>Mock Auth0 Login</h1>
    <form method="POST" action="/authorize">
      ${hidden}
      <label>
        Email
        <input type="text" name="email" value="test-user@example.com" />
      </label>
      <label>
        Token TTL override (seconds, optional)
        <!--
          Not part of real Auth0's /authorize contract -- a real, visible,
          fillable field (not a hidden one a test would have to reach into
          via JS) for a test to request a short-lived token for one login,
          so it can wait for genuine expiry and observe the app's real
          session-expiry handling. Empty means "use the server default."
          See store.ts's IssueCodeParams.ttlSeconds.
        -->
        <input type="number" name="ttl" min="1" />
      </label>
      <button type="submit">Log In</button>
    </form>
  </body>
</html>
`;
}
