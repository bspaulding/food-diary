import jwt from "jsonwebtoken";

export function issueAccessToken(sub: string): string {
  const secret = process.env.HASURA_GRAPHQL_JWT_SECRET;
  if (!secret) throw new Error("HASURA_GRAPHQL_JWT_SECRET is not set");
  const { key } = JSON.parse(secret) as { type: string; key: string };
  const audience = process.env.AUTH0_AUDIENCE ?? "https://direct-satyr-14.hasura.app/v1/graphql";
  const issuer = process.env.MCP_SERVER_URL ?? "http://localhost:3032/mcp";

  return jwt.sign(
    {
      sub,
      "https://hasura.io/jwt/claims": {
        "x-hasura-default-role": "user",
        "x-hasura-allowed-roles": ["user"],
        "x-hasura-user-id": sub,
      },
    },
    key,
    { algorithm: "HS256", audience, issuer, expiresIn: "1h" }
  );
}
