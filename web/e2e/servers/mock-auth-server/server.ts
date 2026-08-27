import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import {
  createRouter,
  readFormBody,
  readJsonBody,
  redirectTo,
  sendHtml,
  sendJson,
} from "../shared/httpServer.ts";
import { signHs256Jwt, signRs256Jwt } from "../shared/jwt.ts";
import { ACCESS_TOKEN_SECRET } from "../shared/secrets.ts";
import { renderLoginPage } from "./loginPage.ts";
import { AuthStore, type PendingAuthorization } from "./store.ts";

export type MockAuthServerOptions = {
  /**
   * Must exactly match `${VITE_AUTH0_DOMAIN}/` (trailing slash) -- this is
   * what @auth0/auth0-spa-js checks the id_token's `iss` claim against
   * (confirmed against its source, see spec §3.2). e.g.
   * "http://localhost:4300/".
   */
  issuer: string;
  /** How long minted access/id tokens claim to be valid for, in seconds. */
  tokenTtlSeconds?: number;
};

const REQUIRED_AUTHORIZE_PARAMS = [
  "client_id",
  "redirect_uri",
  "state",
  "nonce",
  "code_challenge",
] as const;

type TokenRequestBody = {
  grant_type: string;
  client_id: string;
  code: string;
  code_verifier: string;
  redirect_uri: string;
};

function computeCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function missingParams(
  get: (name: string) => string | null,
  required: readonly string[],
): string[] {
  return required.filter((name) => !get(name));
}

/**
 * No `/__test__/*` HTTP endpoints on purpose -- see mock-api-server/server.ts
 * for the rationale. `store` is a plain constructor parameter so this
 * repo's own unit tests can construct/reset one directly rather than
 * resetting a shared instance over the network.
 */
export function createMockAuthServer(
  options: MockAuthServerOptions,
  store: AuthStore = new AuthStore(),
): Server {
  const tokenTtlSeconds = options.tokenTtlSeconds ?? 86400;
  // Generated fresh per process boot rather than shared/fixed: nothing ever
  // verifies this signature (confirmed against @auth0/auth0-spa-js's
  // source -- see spec §3.2), so all that matters is a well-formed RS256
  // JWT shape, not a stable key across restarts.
  const { privateKey }: { privateKey: KeyObject } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const router = createRouter();

  router.on("GET", "/authorize", ({ res, params }) => {
    const missing = missingParams(
      (name) => params.get(name),
      REQUIRED_AUTHORIZE_PARAMS,
    );
    if (missing.length > 0) {
      sendJson(res, 400, {
        error: "invalid_request",
        error_description: `Missing required parameter(s): ${missing.join(", ")}`,
      });
      return;
    }
    sendHtml(res, 200, renderLoginPage(params));
  });

  router.on("POST", "/authorize", async ({ req, res }) => {
    const form = await readFormBody(req);
    const missing = missingParams(
      (name) => form.get(name),
      REQUIRED_AUTHORIZE_PARAMS,
    );
    if (missing.length > 0) {
      sendJson(res, 400, {
        error: "invalid_request",
        error_description: `Missing required parameter(s): ${missing.join(", ")}`,
      });
      return;
    }

    const email = form.get("email");
    if (email) store.setNextLoginUser({ email });

    const ttlParam = form.get("ttl");
    const ttlSeconds = ttlParam ? Number(ttlParam) : undefined;

    const code = store.issueCode({
      clientId: form.get("client_id") as string,
      redirectUri: form.get("redirect_uri") as string,
      codeChallenge: form.get("code_challenge") as string,
      nonce: form.get("nonce") as string,
      ttlSeconds,
    });

    const redirectUrl = new URL(form.get("redirect_uri") as string);
    redirectUrl.searchParams.set("code", code);
    const state = form.get("state");
    if (state) redirectUrl.searchParams.set("state", state);
    redirectTo(res, redirectUrl.toString());
  });

  router.on("POST", "/oauth/token", async ({ req, res }) => {
    const body = await readJsonBody<TokenRequestBody>(req);

    if (body.grant_type !== "authorization_code") {
      sendJson(res, 400, {
        error: "unsupported_grant_type",
        error_description: `Unsupported grant_type: "${String(body.grant_type)}"`,
      });
      return;
    }
    if (
      !body.code ||
      !body.code_verifier ||
      !body.client_id ||
      !body.redirect_uri
    ) {
      sendJson(res, 400, {
        error: "invalid_request",
        error_description:
          "Missing one or more required fields: code, code_verifier, client_id, redirect_uri",
      });
      return;
    }

    let pending: PendingAuthorization;
    try {
      pending = store.consumeCode(body.code);
    } catch (err) {
      sendJson(res, 400, {
        error: "invalid_grant",
        error_description: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (
      pending.clientId !== body.client_id ||
      pending.redirectUri !== body.redirect_uri
    ) {
      sendJson(res, 400, {
        error: "invalid_grant",
        error_description:
          "client_id or redirect_uri does not match the authorization request",
      });
      return;
    }

    if (computeCodeChallenge(body.code_verifier) !== pending.codeChallenge) {
      sendJson(res, 400, {
        error: "invalid_grant",
        error_description:
          "code_verifier does not match the original code_challenge",
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    // Per-login override (real, since a real IdP can vary session length --
    // see IssueCodeParams.ttlSeconds), falling back to the server default.
    const ttlSeconds = pending.ttlSeconds ?? tokenTtlSeconds;
    const idToken = signRs256Jwt(
      {
        iss: options.issuer,
        aud: body.client_id,
        sub: pending.user.sub,
        nonce: pending.nonce,
        name: pending.user.name,
        email: pending.user.email,
        picture: pending.user.picture,
        iat: now,
        exp: now + ttlSeconds,
      },
      privateKey,
    );
    const accessToken = signHs256Jwt(
      { sub: pending.user.sub, iat: now, exp: now + ttlSeconds },
      ACCESS_TOKEN_SECRET,
    );

    sendJson(res, 200, {
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: ttlSeconds,
    });
  });

  function handleLogout({
    res,
    params,
  }: {
    res: ServerResponse;
    params: URLSearchParams;
  }): void {
    const returnTo = params.get("returnTo");
    if (!returnTo) {
      sendJson(res, 400, {
        error: "invalid_request",
        error_description: "Missing returnTo parameter",
      });
      return;
    }
    redirectTo(res, returnTo);
  }
  router.on("GET", "/v2/logout", handleLogout);
  router.on("POST", "/v2/logout", handleLogout);

  return createServer(router.toRequestListener());
}
