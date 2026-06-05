import { describe, it, expect, vi } from "vitest";
import {
  generateRandom,
  generateCodeChallenge,
  storePendingAuthorization,
  consumePendingAuthorization,
  storePendingCode,
  consumePendingCode,
  cleanupExpired,
} from "./oauth.js";

const AUTH_DATA = {
  clientRedirectUri: "https://claude.ai/api/mcp/auth_callback",
  clientState: "abc",
  clientCodeChallenge: "challenge123",
  clientCodeChallengeMethod: "S256",
};

const CODE_DATA = {
  accessToken: "token123",
  codeChallenge: "challenge123",
};

describe("generateRandom", () => {
  it("returns a base64url string of reasonable length", () => {
    const r = generateRandom();
    expect(typeof r).toBe("string");
    expect(r.length).toBeGreaterThan(20);
  });

  it("returns a different value on each call", () => {
    expect(generateRandom()).not.toBe(generateRandom());
  });
});

describe("generateCodeChallenge", () => {
  it("returns the S256 code challenge for a verifier", () => {
    const challenge = generateCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("pending authorizations", () => {
  it("stores and retrieves an authorization", () => {
    const state = generateRandom();
    storePendingAuthorization(state, AUTH_DATA);
    const result = consumePendingAuthorization(state);
    expect(result).toEqual(AUTH_DATA);
  });

  it("returns null for an unknown state", () => {
    expect(consumePendingAuthorization("nonexistent")).toBeNull();
  });

  it("is single-use: second consume returns null", () => {
    const state = generateRandom();
    storePendingAuthorization(state, AUTH_DATA);
    consumePendingAuthorization(state);
    expect(consumePendingAuthorization(state)).toBeNull();
  });

  it("returns null for an expired entry", () => {
    vi.useFakeTimers();
    const state = generateRandom();
    storePendingAuthorization(state, AUTH_DATA);
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(consumePendingAuthorization(state)).toBeNull();
    vi.useRealTimers();
  });
});

describe("pending codes", () => {
  it("stores and retrieves a code", () => {
    const code = generateRandom();
    storePendingCode(code, CODE_DATA);
    expect(consumePendingCode(code)).toEqual(CODE_DATA);
  });

  it("returns null for an unknown code", () => {
    expect(consumePendingCode("nonexistent")).toBeNull();
  });

  it("is single-use: second consume returns null", () => {
    const code = generateRandom();
    storePendingCode(code, CODE_DATA);
    consumePendingCode(code);
    expect(consumePendingCode(code)).toBeNull();
  });

  it("returns null for an expired code", () => {
    vi.useFakeTimers();
    const code = generateRandom();
    storePendingCode(code, CODE_DATA);
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(consumePendingCode(code)).toBeNull();
    vi.useRealTimers();
  });
});

describe("cleanupExpired", () => {
  it("removes expired entries without affecting live ones", () => {
    vi.useFakeTimers();

    const expiredState = generateRandom();
    const expiredCode = generateRandom();
    storePendingAuthorization(expiredState, AUTH_DATA);
    storePendingCode(expiredCode, CODE_DATA);

    vi.advanceTimersByTime(11 * 60 * 1000);

    const liveState = generateRandom();
    const liveCode = generateRandom();
    storePendingAuthorization(liveState, AUTH_DATA);
    storePendingCode(liveCode, CODE_DATA);

    cleanupExpired();

    expect(consumePendingAuthorization(expiredState)).toBeNull();
    expect(consumePendingAuthorization(liveState)).toEqual(AUTH_DATA);
    expect(consumePendingCode(expiredCode)).toBeNull();
    expect(consumePendingCode(liveCode)).toEqual(CODE_DATA);

    vi.useRealTimers();
  });
});
