import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verify, decode, sign } from "jsonwebtoken";
import { issueAccessToken, issueRefreshToken, validateRefreshToken } from "./token.js";
import { validateJWT } from "./auth.js";

const SECRET = "test-secret-key";
const AUDIENCE = "https://direct-satyr-14.hasura.app/v1/graphql";

describe("issueAccessToken", () => {
  beforeEach(() => {
    process.env.HASURA_GRAPHQL_JWT_SECRET = JSON.stringify({ type: "HS256", key: SECRET });
    process.env.AUTH0_AUDIENCE = AUDIENCE;
  });

  afterEach(() => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    delete process.env.AUTH0_AUDIENCE;
    delete process.env.MCP_SERVER_URL;
  });

  it("returns a JWT verifiable with the Hasura secret", () => {
    const token = issueAccessToken("auth0|user-123");
    const decoded = verify(token, SECRET, { audience: AUDIENCE }) as Record<string, unknown>;
    expect(decoded.sub).toBe("auth0|user-123");
  });

  it("includes the Hasura JWT claims namespace with the correct user id", () => {
    const token = issueAccessToken("auth0|user-456");
    const decoded = verify(token, SECRET, { audience: AUDIENCE }) as Record<string, unknown>;
    const claims = decoded["https://hasura.io/jwt/claims"] as Record<string, unknown>;
    expect(claims["x-hasura-user-id"]).toBe("auth0|user-456");
    expect(claims["x-hasura-default-role"]).toBe("user");
    expect(claims["x-hasura-allowed-roles"]).toEqual(["user"]);
  });

  it("uses MCP_SERVER_URL as the issuer", () => {
    process.env.MCP_SERVER_URL = "https://food-diary.motingo.com/mcp";
    const token = issueAccessToken("auth0|user-123");
    const decoded = verify(token, SECRET, {
      audience: AUDIENCE,
      issuer: "https://food-diary.motingo.com/mcp",
    }) as Record<string, unknown>;
    expect(decoded.iss).toBe("https://food-diary.motingo.com/mcp");
  });

  it("falls back to the default audience when AUTH0_AUDIENCE is not set", () => {
    delete process.env.AUTH0_AUDIENCE;
    const token = issueAccessToken("auth0|user-123");
    const decoded = verify(token, SECRET, {
      audience: "https://direct-satyr-14.hasura.app/v1/graphql",
    }) as Record<string, unknown>;
    expect(decoded.sub).toBe("auth0|user-123");
  });

  it("embeds the auth0 access token as the a0t claim when provided", () => {
    const token = issueAccessToken("auth0|user-123", "some-auth0-opaque-token");
    const decoded = verify(token, SECRET, { audience: AUDIENCE }) as Record<string, unknown>;
    expect(decoded.a0t).toBe("some-auth0-opaque-token");
  });

  it("omits the a0t claim when auth0AccessToken is empty", () => {
    const token = issueAccessToken("auth0|user-123", "");
    const decoded = verify(token, SECRET, { audience: AUDIENCE }) as Record<string, unknown>;
    expect(decoded.a0t).toBeUndefined();
  });

  it("throws when HASURA_GRAPHQL_JWT_SECRET is not set", () => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    expect(() => issueAccessToken("sub")).toThrow("HASURA_GRAPHQL_JWT_SECRET is not set");
  });
});

describe("issueRefreshToken / validateRefreshToken", () => {
  beforeEach(() => {
    process.env.HASURA_GRAPHQL_JWT_SECRET = JSON.stringify({ type: "HS256", key: SECRET });
    process.env.AUTH0_AUDIENCE = AUDIENCE;
  });

  afterEach(() => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    delete process.env.AUTH0_AUDIENCE;
    delete process.env.REFRESH_TOKEN_TTL;
  });

  it("round-trips the sub and the Auth0 refresh token", () => {
    const token = issueRefreshToken("auth0|user-123", "a0-refresh-secret");
    const result = validateRefreshToken(token);
    expect(result.sub).toBe("auth0|user-123");
    expect(result.auth0RefreshToken).toBe("a0-refresh-secret");
  });

  it("does not expose the Auth0 refresh token in the JWT payload", () => {
    const token = issueRefreshToken("auth0|user-123", "a0-refresh-secret");
    const payload = decode(token) as { a0rt?: string };
    expect(JSON.stringify(payload)).not.toContain("a0-refresh-secret");
    expect(payload.a0rt).toBeTruthy();
  });

  it("does not carry Hasura claims, so it cannot act as an access token", () => {
    const token = issueRefreshToken("auth0|user-123", "a0-refresh-secret");
    const payload = decode(token) as Record<string, unknown>;
    expect(payload["https://hasura.io/jwt/claims"]).toBeUndefined();
    // validateJWT checks the Hasura audience, so the refresh token is rejected at /mcp
    expect(() => validateJWT(token)).toThrow();
  });

  it("rejects an access token passed as a refresh token (audience mismatch)", () => {
    const accessToken = issueAccessToken("auth0|user-123", "a0-at");
    expect(() => validateRefreshToken(accessToken)).toThrow();
  });

  it("rejects a tampered a0rt ciphertext (GCM auth failure)", () => {
    const token = issueRefreshToken("auth0|user-123", "a0-refresh-secret");
    const { a0rt } = decode(token) as { a0rt: string };
    const [iv, ciphertext, tag] = a0rt.split(".");
    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] ^= 0xff;
    const tamperedA0rt = `${iv}.${flipped.toString("base64url")}.${tag}`;
    expect(() => validateRefreshToken(issueRefreshTokenWithA0rt(tamperedA0rt))).toThrow();
  });

  it("rejects a malformed a0rt claim", () => {
    expect(() => validateRefreshToken(issueRefreshTokenWithA0rt("not-encrypted"))).toThrow();
  });

  it("rejects a refresh token missing sub or a0rt", () => {
    const noA0rt = sign({ sub: "auth0|user-123" }, SECRET, {
      algorithm: "HS256",
      audience: "food-diary-mcp-refresh",
      expiresIn: "30d",
    });
    expect(() => validateRefreshToken(noA0rt)).toThrow(/Malformed refresh token/);
  });

  it("rejects an expired refresh token", () => {
    process.env.REFRESH_TOKEN_TTL = "-1s";
    const token = issueRefreshToken("auth0|user-123", "a0-refresh-secret");
    expect(() => validateRefreshToken(token)).toThrow(/expired/);
  });

  it("respects the REFRESH_TOKEN_TTL env var", () => {
    process.env.REFRESH_TOKEN_TTL = "7d";
    const token = issueRefreshToken("auth0|user-123", "a0-refresh-secret");
    const payload = decode(token) as { iat: number; exp: number };
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it("defaults to a 30 day lifetime", () => {
    const token = issueRefreshToken("auth0|user-123", "a0-refresh-secret");
    const payload = decode(token) as { iat: number; exp: number };
    expect(payload.exp - payload.iat).toBe(30 * 24 * 60 * 60);
  });

  it("throws when HASURA_GRAPHQL_JWT_SECRET is not set", () => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    expect(() => issueRefreshToken("sub", "rt")).toThrow("HASURA_GRAPHQL_JWT_SECRET is not set");
  });
});

// Signs a refresh JWT whose a0rt claim is replaced with the given value,
// keeping the signature valid so only decryption can fail.
function issueRefreshTokenWithA0rt(a0rt: string): string {
  return sign({ sub: "auth0|user-123", a0rt }, SECRET, {
    algorithm: "HS256",
    audience: "food-diary-mcp-refresh",
    expiresIn: "30d",
  });
}
