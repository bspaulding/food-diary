#!/usr/bin/env node
// Usage: HASURA_GRAPHQL_JWT_SECRET='{"type":"HS256","key":"..."}' AUTH0_CLIENT_SECRET=<value> node scripts/debug-jwe.mjs <jwe-token>

import { createHash } from "crypto";
import { compactDecrypt, decodeProtectedHeader } from "jose";

const token = process.argv[2];
const clientSecret = process.env.AUTH0_CLIENT_SECRET ?? "";
const hasuraSecret = process.env.HASURA_GRAPHQL_JWT_SECRET ?? "";

if (!token) {
  console.error("Usage: node scripts/debug-jwe.mjs <jwe-token>");
  process.exit(1);
}

const header = decodeProtectedHeader(token);
console.log("JWE header:", JSON.stringify(header));
console.log("Client secret length (chars):", clientSecret.length);

let hasuraKey = "";
try {
  hasuraKey = JSON.parse(hasuraSecret).key ?? "";
  console.log("Hasura JWT key length (chars):", hasuraKey.length);
  console.log("Hasura JWT key decoded length (bytes):", Buffer.from(hasuraKey, "base64url").length);
} catch { console.log("HASURA_GRAPHQL_JWT_SECRET not set or not JSON"); }

const candidates = [
  // Client secret variants
  ["CS-A: sha256(b64url_decode(clientSecret))",     () => createHash("sha256").update(Buffer.from(clientSecret, "base64url")).digest()],
  ["CS-B: sha256(utf8(clientSecret))",               () => createHash("sha256").update(clientSecret).digest()],
  ["CS-C: b64url_decode(clientSecret).slice(0,32)",  () => Buffer.from(clientSecret, "base64url").subarray(0, 32)],
  ["CS-D: utf8(clientSecret).slice(0,32)",           () => Buffer.from(clientSecret).subarray(0, 32)],

  // Hasura JWT key variants (the resource server's signing key)
  ["HK-A: sha256(b64url_decode(hasuraKey))",         () => createHash("sha256").update(Buffer.from(hasuraKey, "base64url")).digest()],
  ["HK-B: sha256(utf8(hasuraKey))",                  () => createHash("sha256").update(hasuraKey).digest()],
  ["HK-C: b64url_decode(hasuraKey).slice(0,32)",     () => Buffer.from(hasuraKey, "base64url").subarray(0, 32)],
  ["HK-D: b64url_decode(hasuraKey) raw",             () => Buffer.from(hasuraKey, "base64url")],

  // Combined / HKDF-like
  ["CM-A: sha256(utf8(clientSecret+hasuraKey))",     () => createHash("sha256").update(clientSecret + hasuraKey).digest()],
];

let anyCorrectSize = false;
for (const [label, keyFn] of candidates) {
  if (!clientSecret && label.startsWith("CS")) continue;
  if (!hasuraKey && label.startsWith("HK")) continue;
  let key;
  try { key = keyFn(); } catch (e) { console.log(`\n${label} → key error: ${e.message}`); continue; }
  const ok = key.length === 32;
  if (ok) anyCorrectSize = true;
  console.log(`\n${label}`);
  console.log(`  ${key.length} bytes — ${ok ? "✓ right size" : "✗ wrong size, skipping"}`);
  if (!ok) continue;
  try {
    const { plaintext } = await compactDecrypt(token, key);
    console.log("  ✅ DECRYPTED:", Buffer.from(plaintext).toString().slice(0, 300));
    process.exit(0);
  } catch (e) {
    console.log(`  ✗ ${e.message}`);
  }
}

console.log("\n❌ No derivation worked.");
console.log("\nConclusion: Auth0 is using a server-side key, not the client secret or Hasura key.");
console.log("Recommended next step: disable JWT encryption in Auth0 dashboard.");
console.log("  Applications → [your app] → Advanced Settings → OAuth → disable any encryption toggle");
