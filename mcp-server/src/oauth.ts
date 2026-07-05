import { randomBytes, createHash } from "crypto";

interface PendingAuthorization {
  clientRedirectUri: string;
  clientState: string;
  clientCodeChallenge: string;
  clientCodeChallengeMethod: string;
  expiresAt: number;
}

interface PendingCode {
  accessToken: string;
  refreshToken?: string;
  codeChallenge: string;
  expiresAt: number;
}

const pendingAuthorizations = new Map<string, PendingAuthorization>();
const pendingCodes = new Map<string, PendingCode>();

const AUTH_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;

export function generateRandom(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function storePendingAuthorization(
  state: string,
  data: Omit<PendingAuthorization, "expiresAt">
): void {
  pendingAuthorizations.set(state, { ...data, expiresAt: Date.now() + AUTH_TTL_MS });
}

export function consumePendingAuthorization(
  state: string
): Omit<PendingAuthorization, "expiresAt"> | null {
  const entry = pendingAuthorizations.get(state);
  pendingAuthorizations.delete(state);
  if (!entry || entry.expiresAt < Date.now()) return null;
  const { expiresAt: _exp, ...data } = entry;
  return data;
}

export function storePendingCode(code: string, data: Omit<PendingCode, "expiresAt">): void {
  pendingCodes.set(code, { ...data, expiresAt: Date.now() + CODE_TTL_MS });
}

export function consumePendingCode(code: string): Omit<PendingCode, "expiresAt"> | null {
  const entry = pendingCodes.get(code);
  pendingCodes.delete(code);
  if (!entry || entry.expiresAt < Date.now()) return null;
  const { expiresAt: _exp, ...data } = entry;
  return data;
}

export function cleanupExpired(): void {
  const now = Date.now();
  for (const [k, v] of pendingAuthorizations) if (v.expiresAt < now) pendingAuthorizations.delete(k);
  for (const [k, v] of pendingCodes) if (v.expiresAt < now) pendingCodes.delete(k);
}

/* v8 ignore next */
setInterval(cleanupExpired, 60_000).unref();
