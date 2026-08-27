import { createHmac, createSign, type KeyObject } from "node:crypto";

/**
 * Hand-rolled instead of pulling in a JWT library: the shape needed here is
 * tiny and fixed (two algorithms, no key rotation, no registered-claim
 * validation beyond what the caller does), and @auth0/auth0-spa-js's own
 * `id_token` handling (confirmed against its source, see
 * specs/2026-08-26-web-e2e-acceptance-test-harness.md §3.2) never
 * cryptographically verifies the signature at all -- only that
 * `header.alg === "RS256"` and that the claims check out. `access_token`s
 * are HS256 and *are* meaningfully verified, by the mock API server (§3.4).
 */

type JwtHeader = { alg: "HS256" | "RS256"; typ: "JWT" };

function base64url(input: Buffer | string): string {
  return (
    typeof input === "string" ? Buffer.from(input, "utf8") : input
  ).toString("base64url");
}

function encodeSegment(value: JwtHeader | Record<string, unknown>): string {
  return base64url(JSON.stringify(value));
}

function signingInputFor(
  header: JwtHeader,
  payload: Record<string, unknown>,
): string {
  return `${encodeSegment(header)}.${encodeSegment(payload)}`;
}

export function signHs256Jwt(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const signingInput = signingInputFor({ alg: "HS256", typ: "JWT" }, payload);
  const signature = base64url(
    createHmac("sha256", secret).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}

export function verifyHs256Jwt(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerSeg, payloadSeg, signatureSeg] = parts;
  const expected = base64url(
    createHmac("sha256", secret).update(`${headerSeg}.${payloadSeg}`).digest(),
  );
  return expected === signatureSeg;
}

export function signRs256Jwt(
  payload: Record<string, unknown>,
  privateKey: KeyObject,
): string {
  const signingInput = signingInputFor({ alg: "RS256", typ: "JWT" }, payload);
  const signature = base64url(
    createSign("RSA-SHA256").update(signingInput).sign(privateKey),
  );
  return `${signingInput}.${signature}`;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payloadSeg] = token.split(".");
  if (!payloadSeg) throw new Error("Malformed JWT: missing payload segment");
  return JSON.parse(
    Buffer.from(payloadSeg, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

export function decodeJwtHeader(token: string): JwtHeader {
  const [headerSeg] = token.split(".");
  if (!headerSeg) throw new Error("Malformed JWT: missing header segment");
  return JSON.parse(
    Buffer.from(headerSeg, "base64url").toString("utf8"),
  ) as JwtHeader;
}
