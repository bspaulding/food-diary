import jwt from "jsonwebtoken";
import { createSecretKey, createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const REFRESH_AUDIENCE = "food-diary-mcp-refresh";

function signingKey(): string {
  const secret = process.env.HASURA_GRAPHQL_JWT_SECRET;
  if (!secret) throw new Error("HASURA_GRAPHQL_JWT_SECRET is not set");
  const { key } = JSON.parse(secret) as { type: string; key: string };
  return key;
}

export function issueAccessToken(sub: string, auth0AccessToken = ""): string {
  const key = signingKey();
  const audience = process.env.AUTH0_AUDIENCE ?? "https://direct-satyr-14.hasura.app/v1/graphql";
  const issuer = process.env.MCP_SERVER_URL ?? "http://localhost:3032/mcp";

  return jwt.sign(
    {
      sub,
      // Embed the Auth0 access token so handleMcp can forward it to Hasura.
      // Hasura verifies Auth0 tokens (JWKS/RS256); it cannot verify tokens we sign.
      ...(auth0AccessToken ? { a0t: auth0AccessToken } : {}),
      "https://hasura.io/jwt/claims": {
        "x-hasura-default-role": "user",
        "x-hasura-allowed-roles": ["user"],
        "x-hasura-user-id": sub,
      },
    },
    createSecretKey(Buffer.from(key, "utf8")),
    { algorithm: "HS256", audience, issuer, expiresIn: "1h" }
  );
}

// Domain-separated AES-256-GCM key so the Auth0 refresh token inside our
// refresh JWT is opaque to the client (JWT payloads are only base64).
function encryptionKey(): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(signingKey(), "utf8"), "", "food-diary-mcp-refresh-encryption", 32)
  );
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

function decrypt(payload: string): string {
  const [iv, ciphertext, tag] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !ciphertext || !tag) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function issueRefreshToken(sub: string, auth0RefreshToken: string): string {
  const issuer = process.env.MCP_SERVER_URL ?? "http://localhost:3032/mcp";
  return jwt.sign(
    { sub, a0rt: encrypt(auth0RefreshToken) },
    createSecretKey(Buffer.from(signingKey(), "utf8")),
    {
      algorithm: "HS256",
      // Distinct audience: validateJWT (Hasura audience) rejects this token
      // at /mcp, so it can never be replayed as an access token.
      audience: REFRESH_AUDIENCE,
      issuer,
      expiresIn: (process.env.REFRESH_TOKEN_TTL ?? "30d") as jwt.SignOptions["expiresIn"],
    }
  );
}

export function validateRefreshToken(token: string): { sub: string; auth0RefreshToken: string } {
  const hmacKey = createSecretKey(Buffer.from(signingKey(), "utf8"));
  const decoded = jwt.verify(token, hmacKey, {
    algorithms: ["HS256"],
    audience: REFRESH_AUDIENCE,
  }) as { sub?: string; a0rt?: string };
  if (!decoded.sub || !decoded.a0rt) throw new Error("Malformed refresh token");
  return { sub: decoded.sub, auth0RefreshToken: decrypt(decoded.a0rt) };
}
