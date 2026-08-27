import { randomBytes } from "node:crypto";

export type TestUserProfile = {
  sub: string;
  name: string;
  email: string;
  picture: string;
};

// A real external URL here would make the header's <img src> block a full
// page navigation's "load" event on outbound network access this harness
// otherwise never needs -- and CI runners commonly firewall it off entirely,
// hanging the image forever with no response to even fail fast on. A data
// URI resolves instantly and hermetically regardless of network policy.
const PLACEHOLDER_AVATAR =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#818cf8"/></svg>',
  ).toString("base64");

export const DEFAULT_TEST_USER: TestUserProfile = {
  sub: "e2e|test-user",
  name: "Test User",
  email: "test-user@example.com",
  picture: PLACEHOLDER_AVATAR,
};

const CODE_TTL_MS = 60_000;

export type PendingAuthorization = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
  user: TestUserProfile;
  expiresAt: number;
  /** Overrides the server-wide default token lifetime for this login only
   * -- see IssueCodeParams.ttlSeconds. */
  ttlSeconds?: number;
};

export type IssueCodeParams = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
  /**
   * Per-login override for how long the resulting access/id tokens are
   * valid, in seconds -- a real dimension of token issuance (an IdP can
   * legitimately vary session length), not a test-only backdoor. Lets one
   * specific login request a short-lived token so a test can wait for it
   * to genuinely expire and observe the app's real session-expiry
   * handling, instead of a server forcing a fake failure on demand.
   */
  ttlSeconds?: number;
};

/**
 * All state a single mock-auth-server process needs: authorization codes
 * awaiting exchange, and the profile the *next* login will mint a token
 * for (overridable via the login form's own `email` field -- there's no
 * separate test-control endpoint for this).
 */
export class AuthStore {
  private pendingCodes = new Map<string, PendingAuthorization>();
  private nextLoginUser: TestUserProfile = { ...DEFAULT_TEST_USER };

  reset(): void {
    this.pendingCodes.clear();
    this.nextLoginUser = { ...DEFAULT_TEST_USER };
  }

  setNextLoginUser(overrides: Partial<TestUserProfile>): void {
    this.nextLoginUser = { ...this.nextLoginUser, ...overrides };
  }

  issueCode(params: IssueCodeParams): string {
    const code = randomBytes(24).toString("base64url");
    this.pendingCodes.set(code, {
      ...params,
      user: this.nextLoginUser,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
    return code;
  }

  /** Single-use: the code is removed whether or not it turns out valid. */
  consumeCode(code: string): PendingAuthorization {
    const pending = this.pendingCodes.get(code);
    this.pendingCodes.delete(code);
    if (!pending) {
      throw new Error("unknown or already-used authorization code");
    }
    if (pending.expiresAt < Date.now()) {
      throw new Error("authorization code has expired");
    }
    return pending;
  }
}
