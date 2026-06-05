import jwt from "jsonwebtoken";
import { createSecretKey } from "crypto";

export function issueAccessToken(sub: string, auth0AccessToken = ""): string {
  const secret = process.env.HASURA_GRAPHQL_JWT_SECRET;
  if (!secret) throw new Error("HASURA_GRAPHQL_JWT_SECRET is not set");
  const { key } = JSON.parse(secret) as { type: string; key: string };
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
