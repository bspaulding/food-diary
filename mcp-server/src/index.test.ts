import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import supertest from "supertest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { sign, decode } from "jsonwebtoken";
import { app, extractBearerToken } from "./index.js";
import { generateCodeChallenge, generateRandom, storePendingAuthorization, storePendingCode } from "./oauth.js";
import { issueAccessToken, issueRefreshToken, validateRefreshToken } from "./token.js";

const SECRET = "test-secret-key";
const AUDIENCE = "https://direct-satyr-14.hasura.app/v1/graphql";
const AUTH0_DOMAIN = "motingo.auth0.com";

function makeToken() {
  return sign({ sub: "user-123" }, SECRET, { audience: AUDIENCE, expiresIn: "1h" });
}

// A minimal id_token returned by Auth0 during code exchange
function makeIdToken(sub = "auth0|user-123") {
  return sign({ sub }, SECRET, { audience: "test-client-id", expiresIn: "1h" });
}

const mswServer = setupServer(
  http.post(`https://${AUTH0_DOMAIN}/oauth/token`, async ({ request }) => {
    const body = (await request.json()) as { grant_type?: string };
    if (body.grant_type === "refresh_token") {
      return HttpResponse.json({
        access_token: "refreshed-at",
        refresh_token: "rotated-a0-rt",
        token_type: "Bearer",
      });
    }
    return HttpResponse.json({
      id_token: makeIdToken(),
      access_token: "opaque-at",
      refresh_token: "a0-rt",
      token_type: "Bearer",
    });
  }),
  http.post(AUDIENCE, () => HttpResponse.json({ data: {} }))
);

beforeAll(() => {
  process.env.HASURA_GRAPHQL_JWT_SECRET = JSON.stringify({ type: "HS256", key: SECRET });
  process.env.AUTH0_AUDIENCE = AUDIENCE;
  process.env.AUTH0_CLIENT_ID = "test-client-id";
  process.env.AUTH0_CLIENT_SECRET = "test-client-secret";
  mswServer.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => mswServer.resetHandlers());

afterAll(() => {
  delete process.env.HASURA_GRAPHQL_JWT_SECRET;
  delete process.env.AUTH0_AUDIENCE;
  delete process.env.AUTH0_CLIENT_ID;
  delete process.env.AUTH0_CLIENT_SECRET;
  mswServer.close();
});

// ─── extractBearerToken ───────────────────────────────────────────────────────

describe("extractBearerToken", () => {
  it("returns null when no Authorization header", () => {
    expect(extractBearerToken({ headers: {} } as Parameters<typeof extractBearerToken>[0])).toBeNull();
  });

  it("returns null when Authorization is not Bearer", () => {
    expect(
      extractBearerToken({ headers: { authorization: "Basic dXNlcjpwYXNz" } } as Parameters<typeof extractBearerToken>[0])
    ).toBeNull();
  });

  it("returns the token for a valid Bearer header", () => {
    expect(
      extractBearerToken({ headers: { authorization: "Bearer my-token" } } as Parameters<typeof extractBearerToken>[0])
    ).toBe("my-token");
  });
});

// ─── Well-known metadata ──────────────────────────────────────────────────────

describe("GET /.well-known/oauth-protected-resource", () => {
  it("lists our server as the authorization server", async () => {
    const res = await supertest(app).get("/.well-known/oauth-protected-resource");
    expect(res.status).toBe(200);
    expect(res.body.bearer_methods_supported).toContain("header");
    expect(res.body.resource).toMatch(/\/mcp$/);
    // authorization_servers should be the base URL (no /mcp path)
    expect(res.body.authorization_servers[0]).not.toContain("auth0.com");
  });
});

describe("GET /.well-known/oauth-authorization-server", () => {
  it("points token_endpoint at our server, not Auth0", async () => {
    const res = await supertest(app).get("/.well-known/oauth-authorization-server");
    expect(res.status).toBe(200);
    expect(res.body.token_endpoint).toMatch(/\/mcp\/token$/);
    expect(res.body.token_endpoint).not.toContain("auth0.com");
    expect(res.body.authorization_endpoint).toMatch(/\/mcp\/authorize$/);
    expect(res.body.code_challenge_methods_supported).toContain("S256");
  });

  it("advertises the refresh_token grant", async () => {
    const res = await supertest(app).get("/.well-known/oauth-authorization-server");
    expect(res.body.grant_types_supported).toContain("authorization_code");
    expect(res.body.grant_types_supported).toContain("refresh_token");
  });
});

// ─── GET /mcp/authorize ───────────────────────────────────────────────────────

describe("GET /mcp/authorize", () => {
  it("returns 400 for an unregistered redirect_uri without redirecting", async () => {
    const res = await supertest(app).get(
      "/mcp/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fattacker.com%2Fsteal&code_challenge=abc&code_challenge_method=S256&state=s"
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
    // Must not redirect to the attacker URI
    expect(res.headers.location).toBeUndefined();
  });

  it("allows redirect_uris configured via ALLOWED_REDIRECT_URIS env var", async () => {
    process.env.ALLOWED_REDIRECT_URIS = "https://custom.example.com/callback";
    const res = await supertest(app).get(
      "/mcp/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fcustom.example.com%2Fcallback&code_challenge=abc&code_challenge_method=S256&state=s"
    );
    delete process.env.ALLOWED_REDIRECT_URIS;
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(AUTH0_DOMAIN);
  });

  it("redirects to Auth0 even when no state param is provided", async () => {
    const res = await supertest(app).get(
      "/mcp/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc&code_challenge_method=S256"
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(AUTH0_DOMAIN);
  });

  it("redirects to Auth0 with our callback URL and a new state", async () => {
    const res = await supertest(app).get(
      "/mcp/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc&code_challenge_method=S256&state=client-state"
    );
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location as string);
    expect(url.hostname).toBe(AUTH0_DOMAIN);
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    // Our callback, not Claude's
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/mcp\/callback$/);
    // Our state (not the client's state)
    expect(url.searchParams.get("state")).not.toBe("client-state");
    expect(url.searchParams.get("audience")).toBe(AUDIENCE);
  });

  it("requests offline_access from Auth0 so a refresh token is issued", async () => {
    const res = await supertest(app).get(
      "/mcp/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc&code_challenge_method=S256&state=s"
    );
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location as string);
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });
});

// ─── GET /mcp/callback ────────────────────────────────────────────────────────

describe("GET /mcp/callback", () => {
  it("returns 400 for an unknown state", async () => {
    const res = await supertest(app).get("/mcp/callback?code=abc&state=unknown");
    expect(res.status).toBe(400);
  });

  it("exchanges the Auth0 code, issues our own code, redirects to Claude's callback", async () => {
    const state = generateRandom();
    const verifier = generateRandom();
    const challenge = generateCodeChallenge(verifier);
    storePendingAuthorization(state, {
      clientRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      clientState: "claude-state",
      clientCodeChallenge: challenge,
      clientCodeChallengeMethod: "S256",
    });

    const res = await supertest(app).get(`/mcp/callback?code=auth0-code&state=${state}`);
    expect(res.status).toBe(302);
    const redirectUrl = new URL(res.headers.location as string);
    expect(redirectUrl.hostname).toBe("claude.ai");
    expect(redirectUrl.searchParams.get("state")).toBe("claude-state");
    expect(redirectUrl.searchParams.get("code")).toBeTruthy();
  });

  it("forwards Auth0 errors to Claude's callback", async () => {
    const state = generateRandom();
    storePendingAuthorization(state, {
      clientRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      clientState: "claude-state",
      clientCodeChallenge: "challenge",
      clientCodeChallengeMethod: "S256",
    });

    const res = await supertest(app).get(
      `/mcp/callback?error=access_denied&error_description=User+denied&state=${state}`
    );
    expect(res.status).toBe(302);
    const redirectUrl = new URL(res.headers.location as string);
    expect(redirectUrl.searchParams.get("error")).toBe("access_denied");
    expect(redirectUrl.searchParams.get("state")).toBe("claude-state");
  });

  it("uses error code as description when error_description is absent", async () => {
    const state = generateRandom();
    storePendingAuthorization(state, {
      clientRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      clientState: "",
      clientCodeChallenge: "challenge",
      clientCodeChallengeMethod: "S256",
    });

    const res = await supertest(app).get(`/mcp/callback?error=access_denied&state=${state}`);
    expect(res.status).toBe(302);
    const redirectUrl = new URL(res.headers.location as string);
    expect(redirectUrl.searchParams.get("error_description")).toBe("access_denied");
    // No state param when clientState is empty
    expect(redirectUrl.searchParams.has("state")).toBe(false);
  });

  it("redirects with server_error when id_token has no sub claim", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () =>
        // sign a token with no `sub` field
        HttpResponse.json({ id_token: sign({ email: "user@example.com" }, SECRET, { expiresIn: "1h" }) })
      )
    );

    const state = generateRandom();
    storePendingAuthorization(state, {
      clientRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      clientState: "s",
      clientCodeChallenge: "challenge",
      clientCodeChallengeMethod: "S256",
    });

    const res = await supertest(app).get(`/mcp/callback?code=auth0-code&state=${state}`);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location as string).searchParams.get("error")).toBe("server_error");
  });

  it("redirects with server_error when Auth0 token exchange fails", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () => HttpResponse.json({}, { status: 500 }))
    );

    const state = generateRandom();
    storePendingAuthorization(state, {
      clientRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      clientState: "claude-state",
      clientCodeChallenge: "challenge",
      clientCodeChallengeMethod: "S256",
    });

    const res = await supertest(app).get(`/mcp/callback?code=auth0-code&state=${state}`);
    expect(res.status).toBe(302);
    const redirectUrl = new URL(res.headers.location as string);
    expect(redirectUrl.searchParams.get("error")).toBe("server_error");
  });

  it("redirects with server_error when id_token is missing", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () =>
        HttpResponse.json({ access_token: "opaque-only" })
      )
    );

    const state = generateRandom();
    storePendingAuthorization(state, {
      clientRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      clientState: "claude-state",
      clientCodeChallenge: "challenge",
      clientCodeChallengeMethod: "S256",
    });

    const res = await supertest(app).get(`/mcp/callback?code=auth0-code&state=${state}`);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location as string).searchParams.get("error")).toBe("server_error");
  });
});

// ─── POST /mcp/token ──────────────────────────────────────────────────────────

describe("POST /mcp/token", () => {
  it("returns 400 for unsupported grant type", async () => {
    const res = await supertest(app)
      .post("/mcp/token")
      .send("grant_type=client_credentials")
      .set("Content-Type", "application/x-www-form-urlencoded");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unsupported_grant_type");
  });

  it("returns 400 for an unknown code", async () => {
    const res = await supertest(app)
      .post("/mcp/token")
      .send("grant_type=authorization_code&code=unknown&code_verifier=abc")
      .set("Content-Type", "application/x-www-form-urlencoded");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("returns 400 when PKCE verifier does not match", async () => {
    const code = generateRandom();
    storePendingCode(code, { accessToken: "tok", codeChallenge: generateCodeChallenge("correct-verifier") });

    const res = await supertest(app)
      .post("/mcp/token")
      .send(`grant_type=authorization_code&code=${code}&code_verifier=wrong-verifier`)
      .set("Content-Type", "application/x-www-form-urlencoded");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("returns the access token when code and PKCE verifier are valid", async () => {
    const verifier = generateRandom();
    const challenge = generateCodeChallenge(verifier);
    const expectedToken = issueAccessToken("auth0|user-123");
    const code = generateRandom();
    storePendingCode(code, { accessToken: expectedToken, codeChallenge: challenge });

    const res = await supertest(app)
      .post("/mcp/token")
      .send(`grant_type=authorization_code&code=${code}&code_verifier=${verifier}`)
      .set("Content-Type", "application/x-www-form-urlencoded");
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe(expectedToken);
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.expires_in).toBe(3600);
  });

  it("also accepts JSON body", async () => {
    const verifier = generateRandom();
    const challenge = generateCodeChallenge(verifier);
    const expectedToken = issueAccessToken("auth0|user-123");
    const code = generateRandom();
    storePendingCode(code, { accessToken: expectedToken, codeChallenge: challenge });

    const res = await supertest(app)
      .post("/mcp/token")
      .send({ grant_type: "authorization_code", code, code_verifier: verifier });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe(expectedToken);
  });

  it("omits refresh_token when the pending code has none (no offline access)", async () => {
    const verifier = generateRandom();
    const code = generateRandom();
    storePendingCode(code, {
      accessToken: issueAccessToken("auth0|user-123"),
      codeChallenge: generateCodeChallenge(verifier),
    });

    const res = await supertest(app)
      .post("/mcp/token")
      .send({ grant_type: "authorization_code", code, code_verifier: verifier });
    expect(res.status).toBe(200);
    expect(res.body.refresh_token).toBeUndefined();
  });
});

// ─── POST /mcp/token (grant_type=refresh_token) ──────────────────────────────

describe("POST /mcp/token with grant_type=refresh_token", () => {
  const refreshBody = (refresh_token: string) => ({ grant_type: "refresh_token", refresh_token });

  it("issues a new access token carrying the refreshed Auth0 token", async () => {
    const refreshToken = issueRefreshToken("auth0|user-123", "a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(200);
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.expires_in).toBe(3600);
    const claims = decode(res.body.access_token as string) as { sub?: string; a0t?: string };
    expect(claims.sub).toBe("auth0|user-123");
    expect(claims.a0t).toBe("refreshed-at");
  });

  it("returns a re-wrapped refresh token containing the rotated Auth0 refresh token", async () => {
    const refreshToken = issueRefreshToken("auth0|user-123", "a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(200);
    const rewrapped = validateRefreshToken(res.body.refresh_token as string);
    expect(rewrapped.sub).toBe("auth0|user-123");
    // The msw handler rotates: the new wrapper must hold the rotated token
    expect(rewrapped.auth0RefreshToken).toBe("rotated-a0-rt");
  });

  it("sends the decrypted Auth0 refresh token to Auth0", async () => {
    let auth0Body: Record<string, unknown> = {};
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, async ({ request }) => {
        auth0Body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ access_token: "refreshed-at" });
      })
    );

    const refreshToken = issueRefreshToken("auth0|user-123", "original-a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(200);
    expect(auth0Body.grant_type).toBe("refresh_token");
    expect(auth0Body.refresh_token).toBe("original-a0-rt");
  });

  it("re-wraps the original Auth0 refresh token when Auth0 does not rotate", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () =>
        HttpResponse.json({ access_token: "refreshed-at" })
      )
    );

    const refreshToken = issueRefreshToken("auth0|user-123", "stable-a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(200);
    expect(validateRefreshToken(res.body.refresh_token as string).auth0RefreshToken).toBe("stable-a0-rt");
  });

  it("returns invalid_grant for a garbage refresh token", async () => {
    const res = await supertest(app).post("/mcp/token").send(refreshBody("not-a-jwt"));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("returns invalid_grant when the refresh token is missing", async () => {
    const res = await supertest(app).post("/mcp/token").send({ grant_type: "refresh_token" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("returns invalid_grant when an access token is passed as a refresh token", async () => {
    const res = await supertest(app)
      .post("/mcp/token")
      .send(refreshBody(issueAccessToken("auth0|user-123", "a0-at")));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("returns invalid_grant when Auth0 rejects the refresh token", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 403 })
      )
    );

    const refreshToken = issueRefreshToken("auth0|user-123", "revoked-a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("returns server_error when Auth0 is down, so the client keeps its refresh token", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () => HttpResponse.json({}, { status: 500 }))
    );

    const refreshToken = issueRefreshToken("auth0|user-123", "a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("server_error");
  });

  it("returns server_error when the Auth0 request fails at the network level", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () => HttpResponse.error())
    );

    const refreshToken = issueRefreshToken("auth0|user-123", "a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("server_error");
  });

  it("returns server_error when Auth0 responds with malformed JSON", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () =>
        new HttpResponse("not-json", { status: 200, headers: { "Content-Type": "application/json" } })
      )
    );

    const refreshToken = issueRefreshToken("auth0|user-123", "a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("server_error");
  });

  it("returns server_error when Auth0 responds without an access_token", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () => HttpResponse.json({}))
    );

    const refreshToken = issueRefreshToken("auth0|user-123", "a0-rt");
    const res = await supertest(app).post("/mcp/token").send(refreshBody(refreshToken));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("server_error");
  });
});

// ─── Full OAuth flow ──────────────────────────────────────────────────────────

describe("full OAuth flow (authorize → callback → token → mcp)", () => {
  async function runFullOAuthFlow() {
    const verifier = generateRandom();
    const challenge = generateCodeChallenge(verifier);

    const authorizeRes = await supertest(app).get(
      `/mcp/authorize?response_type=code&client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=${challenge}&code_challenge_method=S256&state=original-state`
    );
    const ourState = new URL(authorizeRes.headers.location as string).searchParams.get("state")!;

    const callbackRes = await supertest(app).get(`/mcp/callback?code=auth0-code&state=${ourState}`);
    const ourCode = new URL(callbackRes.headers.location as string).searchParams.get("code")!;

    const tokenRes = await supertest(app)
      .post("/mcp/token")
      .send(`grant_type=authorization_code&code=${ourCode}&code_verifier=${verifier}`)
      .set("Content-Type", "application/x-www-form-urlencoded");
    expect(tokenRes.status).toBe(200);
    return tokenRes.body as { access_token: string; refresh_token?: string };
  }

  it("results in a working MCP Bearer token", async () => {
    const { access_token } = await runFullOAuthFlow();

    const mcpRes = await supertest(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${access_token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      });
    expect(mcpRes.status).toBe(200);
    const dataLine = mcpRes.text.split("\n").find((l) => l.startsWith("data:")) ?? "";
    const payload = JSON.parse(dataLine.slice("data:".length).trim()) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(payload.result?.serverInfo?.name).toBe("food-diary");
  });

  it("embeds the Auth0 access token as the a0t claim for Hasura forwarding", async () => {
    const { access_token } = await runFullOAuthFlow();

    // The MCP JWT must contain Auth0's access token so handleMcp can forward it to Hasura
    const claims = decode(access_token) as { a0t?: string };
    expect(claims?.a0t).toBe("opaque-at");
  });

  it("returns a refresh token that silently renews the access token", async () => {
    const { refresh_token } = await runFullOAuthFlow();
    expect(refresh_token).toBeTruthy();
    expect(validateRefreshToken(refresh_token!).auth0RefreshToken).toBe("a0-rt");

    // Simulate Claude renewing after the 1h access token expires
    const refreshRes = await supertest(app)
      .post("/mcp/token")
      .send(`grant_type=refresh_token&refresh_token=${refresh_token}`)
      .set("Content-Type", "application/x-www-form-urlencoded");
    expect(refreshRes.status).toBe(200);

    const mcpRes = await supertest(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${refreshRes.body.access_token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      });
    expect(mcpRes.status).toBe(200);
  });

  it("omits the refresh token when Auth0 does not grant offline access", async () => {
    mswServer.use(
      http.post(`https://${AUTH0_DOMAIN}/oauth/token`, () =>
        HttpResponse.json({ id_token: makeIdToken(), access_token: "opaque-at" })
      )
    );

    const { access_token, refresh_token } = await runFullOAuthFlow();
    expect(access_token).toBeTruthy();
    expect(refresh_token).toBeUndefined();
  });
});

// ─── POST /mcp auth ───────────────────────────────────────────────────────────

describe("POST /mcp", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const res = await supertest(app).post("/mcp").send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing/);
    expect(res.headers["www-authenticate"]).toMatch(
      /^Bearer resource_metadata=".*\/\.well-known\/oauth-protected-resource"$/
    );
  });

  it("returns 401 when Authorization is not a Bearer token", async () => {
    const res = await supertest(app).post("/mcp").set("Authorization", "Basic dXNlcjpwYXNz").send({});
    expect(res.status).toBe(401);
  });

  it("returns 401 when the JWT is invalid", async () => {
    const res = await supertest(app).post("/mcp").set("Authorization", "Bearer not-a-valid-jwt").send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid/);
    expect(res.headers["www-authenticate"]).toContain('error="invalid_token"');
    expect(res.headers["www-authenticate"]).toContain("/.well-known/oauth-protected-resource");
  });

  it("returns 401 with WWW-Authenticate when the JWT is expired", async () => {
    const expired = sign({ sub: "user-123" }, SECRET, { audience: AUDIENCE, expiresIn: -60 });
    const res = await supertest(app).post("/mcp").set("Authorization", `Bearer ${expired}`).send({});
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain('error="invalid_token"');
  });

  it("passes a valid token through to the MCP transport", async () => {
    const res = await supertest(app)
      .post("/mcp")
      .set("Authorization", `Bearer ${makeToken()}`)
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test-client", version: "1.0.0" } },
      });
    expect(res.status).toBe(200);
    const dataLine = res.text.split("\n").find((l) => l.startsWith("data:")) ?? "";
    const payload = JSON.parse(dataLine.slice("data:".length).trim()) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(payload.result?.serverInfo?.name).toBe("food-diary");
  });
});

describe("GET /mcp", () => {
  it("returns 401 when Authorization header is absent", async () => {
    expect((await supertest(app).get("/mcp")).status).toBe(401);
  });
});

describe("DELETE /mcp", () => {
  it("returns 401 when Authorization header is absent", async () => {
    expect((await supertest(app).delete("/mcp")).status).toBe(401);
  });
});
