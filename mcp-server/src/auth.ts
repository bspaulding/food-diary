import jwt from "jsonwebtoken";
import { createSecretKey } from "crypto";

export interface DecodedToken {
  sub: string;
  "https://hasura.io/jwt/claims"?: {
    "x-hasura-user-id"?: string;
    [key: string]: unknown;
  };
}

export function validateJWT(token: string): DecodedToken {
  const secret = process.env.HASURA_GRAPHQL_JWT_SECRET;
  if (!secret) throw new Error("HASURA_GRAPHQL_JWT_SECRET is not set");
  const { key } = JSON.parse(secret) as { type: string; key: string };
  const audience = process.env.AUTH0_AUDIENCE ?? "https://direct-satyr-14.hasura.app/v1/graphql";
  // createSecretKey forces a KeyObject of type 'secret', bypassing jsonwebtoken's
  // auto-detection which tries createPublicKey first and fails for HS256.
  const hmacKey = createSecretKey(Buffer.from(key, "utf8"));
  return jwt.verify(token, hmacKey, { algorithms: ["HS256"], audience }) as DecodedToken;
}
