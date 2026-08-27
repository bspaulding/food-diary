import type { IncomingMessage } from "node:http";
import { decodeJwtPayload, verifyHs256Jwt } from "../shared/jwt.ts";
import { ACCESS_TOKEN_SECRET } from "../shared/secrets.ts";

export type AuthResult = { sub: string };

/**
 * Real signature + expiry verification of the access_token issued by the
 * mock auth server (§3.4 of the spec) -- unlike the frontend SDK, which
 * never verifies anything about this token (confirmed against its source,
 * spec §3.2), this resource server actually checks it, which is what makes
 * the 401/session-expiry test path meaningful.
 */
export function verifyAccessToken(req: IncomingMessage): AuthResult | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length);
  if (!verifyHs256Jwt(token, ACCESS_TOKEN_SECRET)) return null;

  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(token);
  } catch {
    return null;
  }

  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp < Math.floor(Date.now() / 1000)) return null;

  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) return null;

  return { sub };
}
