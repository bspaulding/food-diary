import { createHash, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decodeJwtHeader,
  decodeJwtPayload,
  verifyHs256Jwt,
} from "../../shared/jwt.ts";
import { ACCESS_TOKEN_SECRET } from "../../shared/secrets.ts";
import { createMockAuthServer } from "../server.ts";
import { AuthStore } from "../store.ts";

const ISSUER = "http://localhost:4300/";
const CLIENT_ID = "e2e-test-client";
const REDIRECT_URI = "http://localhost:5173/auth/callback";

type ErrorResponse = { error: string; error_description: string };
type TokenResponse = {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
};

function makePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

describe("mock auth server", () => {
  // Constructed directly and reset between tests in-process -- no
  // `/__test__/*` HTTP endpoints exist on the server itself; see server.ts.
  const store = new AuthStore();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createMockAuthServer({ issuer: ISSUER }, store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function loginAndGetCode(
    overrides: {
      state?: string;
      nonce?: string;
      email?: string;
      ttl?: number;
    } = {},
  ): Promise<{
    code: string;
    codeVerifier: string;
    state: string;
    nonce: string;
  }> {
    const { codeVerifier, codeChallenge } = makePkcePair();
    const state = overrides.state ?? "test-state";
    const nonce = overrides.nonce ?? "test-nonce";

    const form = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      email: overrides.email ?? "test-user@example.com",
      ...(overrides.ttl ? { ttl: String(overrides.ttl) } : {}),
    });
    const response = await fetch(`${baseUrl}/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    if (!location)
      throw new Error("expected a Location header on the /authorize redirect");
    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get("code");
    if (!code) throw new Error("expected a code query param on the redirect");
    expect(redirectUrl.searchParams.get("state")).toBe(state);
    return { code, codeVerifier, state, nonce };
  }

  async function exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<Response> {
    return fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI,
      }),
    });
  }

  it("GET /authorize renders a login page when required params are present", async () => {
    const url = new URL(`${baseUrl}/authorize`);
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("state", "s");
    url.searchParams.set("nonce", "n");
    url.searchParams.set("code_challenge", "c");

    const response = await fetch(url);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<form method="POST" action="/authorize">');
    expect(html).toContain(`value="${CLIENT_ID}"`);
  });

  it("GET /authorize rejects a request missing required params", async () => {
    const response = await fetch(`${baseUrl}/authorize?client_id=${CLIENT_ID}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_request");
  });

  it("a valid /authorize submission redirects to redirect_uri with a code and the original state", async () => {
    store.reset();
    const { code } = await loginAndGetCode();
    expect(code.length).toBeGreaterThan(0);
  });

  it("POST /authorize rejects a request missing required params", async () => {
    const response = await fetch(`${baseUrl}/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID }).toString(),
    });
    expect(response.status).toBe(400);
  });

  it("exchanges a valid code + code_verifier for an access_token and id_token", async () => {
    store.reset();
    const { code, codeVerifier, nonce } = await loginAndGetCode();

    const tokenResponse = await exchangeCode(code, codeVerifier);
    expect(tokenResponse.status).toBe(200);
    const body = (await tokenResponse.json()) as TokenResponse;
    expect(body.token_type).toBe("Bearer");
    expect(typeof body.expires_in).toBe("number");

    const idHeader = decodeJwtHeader(body.id_token);
    expect(idHeader.alg).toBe("RS256");
    const idClaims = decodeJwtPayload(body.id_token);
    expect(idClaims.iss).toBe(ISSUER);
    expect(idClaims.aud).toBe(CLIENT_ID);
    expect(idClaims.nonce).toBe(nonce);
    expect(idClaims.sub).toBeTruthy();

    expect(verifyHs256Jwt(body.access_token, ACCESS_TOKEN_SECRET)).toBe(true);
    const accessClaims = decodeJwtPayload(body.access_token);
    expect(accessClaims.sub).toBe(idClaims.sub);
  });

  it("rejects a token exchange with a mismatched code_verifier", async () => {
    store.reset();
    const { code } = await loginAndGetCode();
    const { codeVerifier: wrongVerifier } = makePkcePair();

    const response = await exchangeCode(code, wrongVerifier);
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects reusing an already-exchanged code", async () => {
    store.reset();
    const { code, codeVerifier } = await loginAndGetCode();

    const first = await exchangeCode(code, codeVerifier);
    expect(first.status).toBe(200);

    const second = await exchangeCode(code, codeVerifier);
    expect(second.status).toBe(400);
    const body = (await second.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects an unsupported grant_type", async () => {
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("unsupported_grant_type");
  });

  it("rejects a token exchange with missing fields", async () => {
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("invalid_request");
  });

  it("GET /v2/logout redirects to returnTo", async () => {
    const returnTo = "http://localhost:5173/";
    const response = await fetch(
      `${baseUrl}/v2/logout?client_id=${CLIENT_ID}&returnTo=${encodeURIComponent(returnTo)}`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(returnTo);
  });

  it("GET /v2/logout without returnTo is a 400", async () => {
    const response = await fetch(`${baseUrl}/v2/logout?client_id=${CLIENT_ID}`);
    expect(response.status).toBe(400);
  });

  it("the login form's email field overrides the profile used by that login", async () => {
    store.reset();
    const { code, codeVerifier } = await loginAndGetCode({
      email: "alice@example.com",
    });
    const tokenResponse = await exchangeCode(code, codeVerifier);
    const body = (await tokenResponse.json()) as TokenResponse;
    const claims = decodeJwtPayload(body.id_token);
    expect(claims.email).toBe("alice@example.com");
  });

  it("store.reset() (used directly by tests above) actually clears pending codes", async () => {
    const { code, codeVerifier } = await loginAndGetCode();
    store.reset();

    const response = await exchangeCode(code, codeVerifier);
    expect(response.status).toBe(400);
  });

  it("an optional ttl on the login request shortens the issued token's real lifetime", async () => {
    store.reset();
    const { code, codeVerifier } = await loginAndGetCode({ ttl: 5 });

    const tokenResponse = await exchangeCode(code, codeVerifier);
    const body = (await tokenResponse.json()) as TokenResponse;
    expect(body.expires_in).toBe(5);

    const claims = decodeJwtPayload(body.access_token);
    expect((claims.exp as number) - (claims.iat as number)).toBe(5);
  });
});
