import jwt from "jsonwebtoken";
import { compactDecrypt } from "jose";

export interface DecodedToken {
  sub: string;
  "https://hasura.io/jwt/claims"?: {
    "x-hasura-user-id"?: string;
    [key: string]: unknown;
  };
}

export async function validateJWT(token: string): Promise<DecodedToken> {
  const secret = process.env.HASURA_GRAPHQL_JWT_SECRET;
  if (!secret) throw new Error("HASURA_GRAPHQL_JWT_SECRET is not set");

  const parsed = JSON.parse(secret) as { type: string; key: string };
  const audience =
    process.env.AUTH0_AUDIENCE ?? "https://direct-satyr-14.hasura.app/v1/graphql";

  if (token.split(".").length === 5) {
    const clientSecret = process.env.AUTH0_CLIENT_SECRET;
    if (!clientSecret) throw new Error("AUTH0_CLIENT_SECRET is not set");
    const keyBytes = Buffer.from(clientSecret, "base64url").subarray(0, 32);
    const { plaintext } = await compactDecrypt(token, keyBytes);
    const innerToken = Buffer.from(plaintext).toString();
    return jwt.verify(innerToken, parsed.key, { algorithms: ["HS256"], audience }) as DecodedToken;
  }

  return jwt.verify(token, parsed.key, { algorithms: ["HS256"], audience }) as DecodedToken;
}
