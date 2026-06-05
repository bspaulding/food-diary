import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateJWT } from "./auth.js";
import { registerTools } from "./tools.js";
import { logger } from "./logger.js";
import {
  generateRandom,
  generateCodeChallenge,
  storePendingAuthorization,
  consumePendingAuthorization,
  storePendingCode,
  consumePendingCode,
} from "./oauth.js";
import { issueAccessToken } from "./token.js";

const PORT = parseInt(process.env.PORT ?? "3032", 10);
const SERVER_URL = process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}/mcp`;
const BASE_URL = new URL(SERVER_URL).origin;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN ?? "motingo.auth0.com";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE ?? "https://direct-satyr-14.hasura.app/v1/graphql";
const AUTHORIZATION_ENDPOINT = `${SERVER_URL}/authorize`;
const CALLBACK_ENDPOINT = `${SERVER_URL}/callback`;
const TOKEN_ENDPOINT = `${SERVER_URL}/token`;

// Read at request time so tests can set these after module load
/* v8 ignore next 2 */
const auth0ClientId = () => process.env.AUTH0_CLIENT_ID ?? "";
const auth0ClientSecret = () => process.env.AUTH0_CLIENT_SECRET ?? "";

// Allowlist of permitted redirect_uris. Must be exact matches.
// Set ALLOWED_REDIRECT_URIS as a comma-separated list to override.
const allowedRedirectUris = (): string[] =>
  (process.env.ALLOWED_REDIRECT_URIS ?? "https://claude.ai/api/mcp/auth_callback")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: SERVER_URL,
    authorization_servers: [BASE_URL],
    bearer_methods_supported: ["header"],
  });
});

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: AUTHORIZATION_ENDPOINT,
    token_endpoint: TOKEN_ENDPOINT,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
  });
});

// Step 1: Claude.ai initiates OAuth. We store their redirect_uri + PKCE, then redirect to Auth0.
app.get(new URL(AUTHORIZATION_ENDPOINT).pathname, (req, res) => {
  const q = req.query as Record<string, string>;

  if (!allowedRedirectUris().includes(q.redirect_uri)) {
    logger.warn("authorize: rejected unregistered redirect_uri", { redirect_uri: q.redirect_uri });
    // Do NOT redirect — redirecting to an unvalidated URI is the vulnerability itself.
    res.status(400).json({ error: "invalid_request", error_description: "redirect_uri not allowed" });
    return;
  }

  const ourState = generateRandom();

  storePendingAuthorization(ourState, {
    clientRedirectUri: q.redirect_uri,
    clientState: q.state ?? "",
    clientCodeChallenge: q.code_challenge,
    clientCodeChallengeMethod: q.code_challenge_method,
  });

  logger.info("authorize: redirecting to auth0", { client_id: q.client_id, state: ourState });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: auth0ClientId(),
    redirect_uri: CALLBACK_ENDPOINT,
    state: ourState,
    audience: AUTH0_AUDIENCE,
    scope: "openid profile email",
  });

  res.redirect(`https://${AUTH0_DOMAIN}/authorize?${params.toString()}`);
});

// Step 2: Auth0 redirects back to us. We exchange the code, issue our own token, redirect to Claude.ai.
app.get(new URL(CALLBACK_ENDPOINT).pathname, async (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  const pending = consumePendingAuthorization(state);
  if (!pending) {
    logger.warn("callback: unknown or expired state", { state });
    res.status(400).send("Unknown or expired authorization state");
    return;
  }

  if (error) {
    logger.warn("callback: auth0 error", { error, error_description });
    const p = new URLSearchParams({ error, error_description: error_description ?? error });
    if (pending.clientState) p.set("state", pending.clientState);
    res.redirect(`${pending.clientRedirectUri}?${p.toString()}`);
    return;
  }

  let sub: string;
  let auth0AccessToken = "";
  try {
    const tokenRes = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: auth0ClientId(),
        client_secret: auth0ClientSecret(),
        code,
        redirect_uri: CALLBACK_ENDPOINT,
      }),
    });

    if (!tokenRes.ok) throw new Error(`Auth0 token exchange failed: ${tokenRes.status}`);

    const tokenData = (await tokenRes.json()) as { id_token?: string; access_token?: string };
    if (!tokenData.id_token) throw new Error("No id_token in Auth0 response");

    auth0AccessToken = tokenData.access_token ?? "";

    // Decode without re-verifying — we received this directly from Auth0 over HTTPS
    const decoded = jwt.decode(tokenData.id_token) as { sub?: string } | null;
    sub = decoded?.sub ?? "";
    if (!sub) throw new Error("Could not extract sub from id_token");
  } catch (e) {
    logger.error("callback: token exchange failed", { error: (e as Error).message });
    const p = new URLSearchParams({ error: "server_error" });
    if (pending.clientState) p.set("state", pending.clientState);
    res.redirect(`${pending.clientRedirectUri}?${p.toString()}`);
    return;
  }

  const accessToken = issueAccessToken(sub, auth0AccessToken);
  const ourCode = generateRandom();
  storePendingCode(ourCode, { accessToken, codeChallenge: pending.clientCodeChallenge });

  logger.info("callback: issued code", { sub });

  const p = new URLSearchParams({ code: ourCode });
  if (pending.clientState) p.set("state", pending.clientState);
  res.redirect(`${pending.clientRedirectUri}?${p.toString()}`);
});

// Step 3: Claude.ai exchanges our code for our access token, proving they hold the PKCE verifier.
app.post(new URL(TOKEN_ENDPOINT).pathname, (req, res) => {
  const { code, code_verifier, grant_type } = req.body as Record<string, string>;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  const pending = consumePendingCode(code);
  if (!pending) {
    logger.warn("token: unknown or expired code");
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  if (generateCodeChallenge(code_verifier) !== pending.codeChallenge) {
    logger.warn("token: pkce verification failed");
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  logger.info("token: access token issued");
  res.json({ access_token: pending.accessToken, token_type: "Bearer", expires_in: 3600 });
});

export function extractBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function handleMcp(req: express.Request, res: express.Response): Promise<void> {
  logger.info("request", { method: req.method, path: req.path });

  const token = extractBearerToken(req);
  if (!token) {
    logger.warn("auth rejected: missing token", { method: req.method, path: req.path });
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  let decoded: ReturnType<typeof validateJWT>;
  try {
    decoded = validateJWT(token);
  } catch (e) {
    logger.warn("auth rejected: invalid token", { error: (e as Error).message });
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const sub = decoded.sub;
  logger.info("authenticated", { method: req.method, path: req.path, sub });

  // Use the Auth0 access token for Hasura (Hasura verifies it via JWKS/RS256).
  // Fall back to the MCP token itself for local dev/test scenarios without a0t.
  const hasuraToken = decoded.a0t || token;

  const server = new McpServer({ name: "food-diary", version: "1.0.0" });
  registerTools(server, hasuraToken);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  /* v8 ignore next 4 */
  res.on("finish", () => {
    transport.close();
    server.close();
  });
}

app.post("/mcp", handleMcp);
app.get("/mcp", handleMcp);
app.delete("/mcp", handleMcp);

/* v8 ignore next 5 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    logger.info("server started", { port: PORT });
  });
}
