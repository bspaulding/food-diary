import { createHash } from "crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sign } from "jsonwebtoken";
import { CompactEncrypt } from "jose";
import { validateJWT } from "./auth.js";

const SECRET = "test-secret-key";
const AUDIENCE = "https://direct-satyr-14.hasura.app/v1/graphql";

// 32-byte key expressed as base64url — required for AES-256-GCM (the JWE enc algorithm)
const JWE_KEY_BASE64URL = Buffer.alloc(32, "k").toString("base64url");

function makeToken(opts: { secret?: string; audience?: string } = {}) {
  return sign({ sub: "user-123" }, opts.secret ?? SECRET, {
    audience: opts.audience ?? AUDIENCE,
    expiresIn: "1h",
  });
}

async function makeJweToken(opts: { audience?: string } = {}) {
  // Inner JWT is signed with the Hasura secret (SECRET); outer JWE is encrypted with the client secret key
  const innerJwt = sign({ sub: "user-123" }, SECRET, {
    audience: opts.audience ?? AUDIENCE,
    expiresIn: "1h",
  });
  const keyBytes = createHash("sha256").update(Buffer.from(JWE_KEY_BASE64URL, "base64url")).digest();
  return new CompactEncrypt(new TextEncoder().encode(innerJwt))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(keyBytes);
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

  it("returns the decoded payload for a valid token", async () => {
    const decoded = await validateJWT(makeToken());
    expect(decoded.sub).toBe("user-123");
  });

  it("throws when HASURA_GRAPHQL_JWT_SECRET is not set", async () => {
    delete process.env.HASURA_GRAPHQL_JWT_SECRET;
    await expect(validateJWT(makeToken())).rejects.toThrow("HASURA_GRAPHQL_JWT_SECRET is not set");
  });

  it("throws for a token signed with the wrong key", async () => {
    await expect(validateJWT(makeToken({ secret: "wrong-secret" }))).rejects.toThrow();
  });

  it("throws for a token with the wrong audience", async () => {
    await expect(validateJWT(makeToken({ audience: "https://wrong.example.com" }))).rejects.toThrow();
  });

  it("throws for an expired token", async () => {
    const token = sign({ sub: "user-123" }, SECRET, { audience: AUDIENCE, expiresIn: -1 });
    await expect(validateJWT(token)).rejects.toThrow();
  });

  it("falls back to the default audience when AUTH0_AUDIENCE is not set", async () => {
    delete process.env.AUTH0_AUDIENCE;
    const token = makeToken({ audience: "https://direct-satyr-14.hasura.app/v1/graphql" });
    const decoded = await validateJWT(token);
    expect(decoded.sub).toBe("user-123");
  });

  describe("JWE tokens (Auth0 encrypted tokens)", () => {
    beforeEach(() => {
      process.env.AUTH0_CLIENT_SECRET = JWE_KEY_BASE64URL;
    });

    afterEach(() => {
      delete process.env.AUTH0_CLIENT_SECRET;
    });

    it("decrypts a JWE token and returns the decoded payload", async () => {
      const jweToken = await makeJweToken();
      const decoded = await validateJWT(jweToken);
      expect(decoded.sub).toBe("user-123");
    });

    it("throws when AUTH0_CLIENT_SECRET is not set", async () => {
      delete process.env.AUTH0_CLIENT_SECRET;
      const jweToken = await makeJweToken();
      await expect(validateJWT(jweToken)).rejects.toThrow("AUTH0_CLIENT_SECRET is not set");
    });

    it("throws for a JWE token encrypted with the wrong key", async () => {
      const wrongKey = Buffer.alloc(32, "x").toString("base64url");
      const wrongKeyBytes = createHash("sha256").update(Buffer.from(wrongKey, "base64url")).digest();
      const jweToken = await new CompactEncrypt(new TextEncoder().encode("inner"))
        .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
        .encrypt(wrongKeyBytes);
      await expect(validateJWT(jweToken)).rejects.toThrow();
    });
  });
});
