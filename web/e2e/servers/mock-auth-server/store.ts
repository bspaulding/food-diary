import { randomBytes } from "node:crypto";

export type TestUserProfile = {
  sub: string;
  name: string;
  email: string;
  picture: string;
};

export const DEFAULT_TEST_USER: TestUserProfile = {
  sub: "e2e|test-user",
  name: "Test User",
  email: "test-user@example.com",
  picture: "https://example.com/avatar.png",
};

const CODE_TTL_MS = 60_000;

export type PendingAuthorization = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
  user: TestUserProfile;
  expiresAt: number;
};

export type IssueCodeParams = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  nonce: string;
};

/**
 * All state a single mock-auth-server process needs: authorization codes
 * awaiting exchange, and the profile the *next* login will mint a token
 * for (overridable per test via /__test__/set-user).
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
