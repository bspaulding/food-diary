import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sign } from "jsonwebtoken";
import { validateJWT } from "./auth.js";

const SECRET = "test-secret-key";
const AUDIENCE = "https://direct-satyr-14.hasura.app/v1/graphql";

function makeToken(opts: { secret?: string; audience?: string } = {}) {
  return sign({ sub: "user-123" }, opts.secret ?? SECRET, {
    audience: opts.audience ?? AUDIENCE,
    expiresIn: "1h",
  });
}

describe("validateJWT", () => {
  beforeEach(() => {
    process.env.HASURA_GRAPHQL_JWT_SECRET = JSON.stringify({ type: "HS256", key: SECRET });
    process.env.AUTH0_AUDIENCE = AUDIENCE;
  });

  afterEach(() => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    delete process.env.AUTH0_AUDIENCE;
  });

  it("returns the decoded payload for a valid token", () => {
    const decoded = validateJWT(makeToken());
    expect(decoded.sub).toBe("user-123");
  });

  it("throws when HASURA_GRAPHQL_JWT_SECRET is not set", () => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    expect(() => validateJWT(makeToken())).toThrow("HASURA_GRAPHQL_JWT_SECRET is not set");
  });

  it("throws for a token signed with the wrong key", () => {
    expect(() => validateJWT(makeToken({ secret: "wrong-secret" }))).toThrow();
  });

  it("throws for a token with the wrong audience", () => {
    expect(() => validateJWT(makeToken({ audience: "https://wrong.example.com" }))).toThrow();
  });

  it("throws for an expired token", () => {
    // expiresIn: -1 means the token expired 1 second ago
    const token = sign({ sub: "user-123" }, SECRET, { audience: AUDIENCE, expiresIn: -1 });
    expect(() => validateJWT(token)).toThrow();
  });

  it("falls back to the default audience when AUTH0_AUDIENCE is not set", () => {
    delete process.env.AUTH0_AUDIENCE;
    const token = makeToken({ audience: "https://direct-satyr-14.hasura.app/v1/graphql" });
    const decoded = validateJWT(token);
    expect(decoded.sub).toBe("user-123");
  });
});
