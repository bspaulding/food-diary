# Food Diary — Black-Box E2E Acceptance Test Harness

**Status:** Draft
**Author:** Claude (for Brad Spaulding)
**Last updated:** 2026-08-26
**Target:** Replace the current in-process "browser mode" acceptance tests with a
true black-box, multi-process end-to-end suite: real built frontend + mock
GraphQL/REST API server + mock PKCE auth server + a Playwright-driven real
browser, all talking over real HTTP.

---

## 1. Why the current suite doesn't satisfy this goal

`web/src/acceptance*.test.tsx` (run via `vitest --config vitest.acceptance.config.mts`,
see `web/ACCEPTANCE_TESTS.md`) look like E2E tests but are not black-box:

- They render Solid **components directly** (`render(() => <Router root={App}>...)`)
  inside the Vitest browser-mode test context. The app's source is transformed
  and executed in the *same* JS realm as the test — there is no separate
  frontend process, no `index.html`, no real client-side navigation/history.
- `./Auth0` is replaced wholesale with `vi.mock()` — the real
  `@auth0/auth0-spa-js` client, the redirect, and the PKCE token exchange
  never run. Auth is simply asserted to be "on."
- Network is intercepted by an MSW **browser worker running in the test's own
  page**, matched by substring on the GraphQL query text. There's no
  independent server process, so a rewrite of the frontend that changed *how*
  it calls the API (batching, REST instead of GraphQL, a different transport)
  would still "pass" as long as the query text happened to still match.
- Per `ACCEPTANCE_TESTS.md`'s own "Known Issues," 2 of the 4 tests are
  documented as broken (click → state-update doesn't propagate in this mode),
  and coverage is minimal (list view + one happy-path item creation).

None of this exercises the actual contract the user cares about verifying
against a full rewrite: *given only a base URL for the app, a mock API, and a
mock auth server, does the real, compiled frontend — running in a real
browser, doing real navigation and real HTTP — behave correctly end to end?*

This doc proposes a full replacement, built on Playwright Test, with the app
served as a real static build, and two small hand-written mock servers
standing in for Hasura and Auth0.

**Recommendation:** keep the fast, in-process Vitest unit/component tests
(`*.test.tsx` outside `acceptance*`) exactly as they are — they're cheap,
plentiful, and cover per-component edge cases the E2E suite shouldn't waste
time re-asserting. Retire `vitest.acceptance.config.mts`,
`src/acceptance*.test.tsx`, `src/test-setup-browser.ts`, and
`ACCEPTANCE_TESTS.md`, replacing them with the new suite described below.

---

## 2. Target architecture

Four processes, orchestrated by Playwright's native multi-`webServer` support
(Playwright ≥1.42 accepts an array for `webServer`, each with its own command,
port, and readiness check — no custom process manager needed):

```
                         ┌─────────────────────────────┐
   Playwright Test       │        Chromium (real)       │
   (driver process) ───► │  loads http://localhost:5173 │
                         └───────────────┬──────────────┘
                                          │ real navigation, real fetch()
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
        ┌───────────────────┐  ┌───────────────────┐  ┌──────────────────────┐
        │  web frontend      │  │  mock API server   │  │  mock auth server    │
        │  (vite preview,    │  │  :4200              │  │  :4300               │
        │   the real build)  │  │  in-memory store,   │  │  OAuth2/OIDC + PKCE  │
        │  :5173             │  │  GraphQL + REST     │  │  RS256 id_token,     │
        │                    │  │  no test-only routes│  │  no JWKS needed      │
        └───────────────────┘  └───────────────────┘  └──────────────────────┘
```

Everything runs over plain **HTTP** on `localhost`. Chromium treats
`http://localhost` as a secure context, so `getUserMedia` (camera flow) still
works without TLS, and there's no mixed-content or self-signed-cert problem to
route around. Today's dev server forces HTTPS via `@vitejs/plugin-basic-ssl`;
that stays for local `npm run dev` but must be switchable off for the E2E
build (see §3.1).

The frontend is pointed at the mock servers **only** via env vars fed into
the Vite build/preview — nothing in test code reaches into the app's
internals. That's the "total black box" property the user asked for.

---

## 3. Harness changes required

### 3.1 Frontend seams — a proxy-target override, not an app-code change

The first draft of this section had `Api.ts` and `CameraModal.tsx` read
`import.meta.env.VITE_*` overrides for each of the three relative paths
(`/api/v1/graphql`, `/llm/lookup`, `/labeller/upload`), reasoning that
something had to make those resolvable without Vite's dev proxy or nginx in
front of them. That was unnecessary complexity — checking the installed
`vite@^8.0.0` source directly (`node_modules/vite/dist/node/chunks/node.js`,
`resolvePreviewOptions`) shows `vite preview`'s proxy config is
`preview?.proxy ?? server.proxy` — **it already falls back to this project's
existing `server.proxy` block when no separate `preview.proxy` is set**,
which is the case here. Confirmed at runtime too: a `vite build` produced
with `FOOD_DIARY_MOCK_SERVER_URL` set is **byte-for-byte identical** to a
default build (same content hash on the output JS), and curling a
`vite preview` server through that proxy with the env var set correctly
routes `/api/v1/graphql` → `/v1/graphql`, `/llm/lookup` → `/lookup`, and
`/labeller/upload` → `/upload` on the target.

So the actual change is entirely in `web/vite.config.mts`, generalizing the
existing `useLocalHasura`/`useLocalLlmNutritionApi` proxy-target logic: a new
`FOOD_DIARY_MOCK_SERVER_URL` env var, when set, overrides the target for all
three proxy entries (`/api`, `/llm`, `/labeller`) to the same single mock
server — matching the single-process mock API server design in §3.4, which
serves `/v1/graphql`, `/lookup`, and `/upload` at its root (i.e. the same
path shape the real Hasura/llm-nutrition-api services present *after* Vite's
existing `rewrite` strips each prefix). `Api.ts` and `CameraModal.tsx` are
untouched — this is the one thing the harness injects to point the app at
the mock backend, exactly as the original ask described, and it means a full
rewrite of the app needs zero adaptation to pass this suite as long as it
keeps calling the same relative paths (which it must anyway, since that's
also what production's nginx config expects).

`web/vite.config.mts` also makes the `basicSsl()` plugin conditional
(`process.env.FOOD_DIARY_HTTPS !== "false"`) so Playwright doesn't have to
deal with a self-signed cert to load the app's own origin — unrelated to the
proxy-target question above, but bundled into the same file. `VITE_AUTH0_DOMAIN`/
`VITE_AUTH0_CLIENT_ID` are already env-driven (`web/src/Auth0.ts`) — no code
change needed there. Point `VITE_AUTH0_DOMAIN` at `http://localhost:4300` for
tests (auth0-spa-js accepts a domain that already includes a scheme and uses
it verbatim instead of prepending `https://`, confirmed in §3.2).

None of this touches application source (`.ts`/`.tsx`) at all — only build
config (`vite.config.mts`) — so it's inherently safe to land ahead of the
rest, verified by the existing unit tests, a `tsc`/type-coverage pass, and
the bundle-identity/curl checks above.

### 3.2 Auth0 SDK contract — confirmed against source

`@auth0/auth0-spa-js@^1.22` is used via `createAuth0Client(...)` /
`loginWithRedirect` / `handleRedirectCallback` / `getTokenSilently` /
`getUser` / `logout`. Rather than guess, `1.22.4` was installed standalone and
its TypeScript source (`node_modules/@auth0/auth0-spa-js/src/{Auth0Client,jwt,api,http,utils}.ts`)
read directly. This settles every question §3.2 originally flagged as open,
and simplifies the mock auth server considerably versus the original
JWKS/RS256-verification assumption below.

**Domain handling (`Auth0Client.ts`, `getDomain`/`getTokenIssuer`).** A
`domain` option that already starts with `http://` or `https://` is used
*verbatim*; only a bare host gets `https://` prepended. So
`VITE_AUTH0_DOMAIN=http://localhost:4300` works with no TLS needed for the
auth server. The expected `id_token` issuer becomes `${domainUrl}/` — i.e.
**`http://localhost:4300/`, with the trailing slash** (no separate `issuer`
option is passed by this app, so this is the only value that will validate).

**`GET /authorize` — query params the SDK actually sends**
(`Auth0Client.ts` `_getParams`/`_url`): `client_id`, `redirect_uri`, `state`,
`nonce`, `code_challenge`, `code_challenge_method=S256`, `response_type=code`,
`response_mode=query`, plus `audience`, `scope=openid`, and `auth0Client`
(base64 JSON, telemetry only) which the mock can ignore. `state` is an opaque
random string — just echo it back unmodified on the redirect.

**`POST /oauth/token` — exact wire format** (`api.ts` `oauthToken`,
confirmed: this app never sets `useFormData`, so it takes the `false`
branch): `Content-Type: application/json`, and the **JSON body contains only**
`{ client_id, code_verifier, grant_type: "authorization_code", code, redirect_uri }`
— `audience`/`scope` are *not* in the token-exchange body (the SDK only uses
them internally for its own cache key). Success is **HTTP 200** with JSON
`{ access_token, id_token, token_type, expires_in, scope? }`. Failure is any
non-2xx status with JSON `{ error, error_description }` (`http.ts` `getJSON`
destructures `{ error, error_description, ...data }` from the body and throws
`GenericError(error, error_description)` when `!response.ok` — `error:
"mfa_required"` is special-cased and irrelevant here). This is the exact
shape a `400 { error: "invalid_grant", error_description: "..." }` needs for
the replay/mismatched-verifier test in the table below.

**`id_token` verification — the single biggest finding (`jwt.ts` `verify`).**
The SDK does **not cryptographically verify the `id_token`'s signature at
all** — `verify()` only base64url-decodes the JWT and checks *claims*:
`iss` (must equal the issuer above, exactly), `sub` present, `aud` equals
`client_id`, `nonce` equals the one sent to `/authorize`, `exp`/`iat`/`nbf`
within a 60s leeway window. **The one signature-adjacent check that does
exist** is purely syntactic: `decoded.header.alg !== 'RS256'` throws — so the
JWT header must literally contain `"alg":"RS256"`, but nothing checks that
the bytes are actually a valid RS256 signature. Net effect: **no
`/.well-known/jwks.json`, no `/.well-known/openid-configuration`, and no
signature-verification logic on the SDK side are needed at all.** The mock
auth server still signs `id_token`s with a real RS256 keypair generated once
at process boot (a handful of lines via `node:crypto.generateKeyPairSync`,
no JWKS endpoint needed to serve it) purely so the token is well-formed and
the mock's own code isn't lying about what it produced — but this is a
correctness/hygiene choice, not a requirement.

**`getUser()`/`isAuthenticated()` are pure cache reads — no network.**
(`Auth0Client.ts` lines ~592-607, ~1001-1004): both just look up the decoded
`id_token` from the configured cache (`localStorage` here) by
`{client_id, audience, scope}` key. **`/userinfo` is never called anywhere in
this SDK version** — drop it from the mock entirely.

**No silent-auth iframe in this app's flow.** `getTokenSilently()`
(`_getTokenSilently`) checks the cache *before* attempting any network path;
`handleRedirectCallback` populates that exact cache entry via
`cacheManager.set(...)` right before `Auth0.ts` calls `getTokenSilently()`, so
the cache hit is immediate — the `prompt=none` hidden-iframe path
(`_getTokenFromIFrame`) is never reached for a fresh login **or** a page
reload with `cacheLocation: "localstorage"` (the cache persists across
reloads, so a reload during the test — used in the nutrition-targets
persistence step — also re-authenticates from cache with no network call, as
long as the token's `expires_in` comfortably outlives the test run, e.g. 24h).
Still worth a minimal handler on `/authorize?...&prompt=none` that responds
in a way an iframe `postMessage` listener will just time out on, so a future
regression that *does* trigger silent auth fails loudly instead of hanging
forever.

**`logout()` (`Auth0Client.ts` `buildLogoutUrl`/`logout`).** Clears the local
cache/cookies, then `window.location.assign(...)` to
`${domainUrl}/v2/logout?client_id=...&returnTo=...&auth0Client=...` (whatever
options `App.tsx` passed — here just `returnTo`). The mock only needs to
302-redirect to the `returnTo` query param.

### 3.3 Mock auth server (`web/e2e/servers/mock-auth-server/`)

A minimal, from-scratch OIDC/OAuth2 Authorization-Code+PKCE provider — not a
library. Runs on its own port (e.g. `4300`), in-memory only. Per §3.2's
findings, this is smaller than originally scoped: no JWKS, no discovery
document, no `/userinfo`.

**Endpoints:**

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/authorize` | Validate `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`, `nonce` are present. Serve a tiny static HTML "login" page (one input pre-filled with a test user id/email, one submit button) so Playwright can drive a *real* login interaction rather than an instant bounce. On submit, mint an opaque authorization `code`, store `{code_challenge, redirect_uri, client_id, nonce, user}` server-side keyed by code, redirect to `redirect_uri?code=...&state=...`. If `prompt=none` is present, skip the login page and immediately respond in a way that lets a hidden-iframe caller time out cleanly (see §3.2) rather than serving the interactive page. |
| `POST` | `/oauth/token` | `grant_type=authorization_code`: parse the **JSON** body (`client_id`, `code_verifier`, `code`, `redirect_uri` — no `audience`/`scope`, per §3.2), look up the stored code, verify `base64url(SHA256(code_verifier)) === code_challenge`, verify `redirect_uri`/`client_id` match, then respond `200 { access_token, id_token, token_type: "Bearer", expires_in }`. Codes are single-use; a mismatched verifier, expired code, or reused code returns `400 { error: "invalid_grant", error_description: "..." }` (worth one test asserting the login flow can't be replayed). |
| `GET`/`POST` | `/v2/logout` | Auth0's logout endpoint shape (`client_id`, `returnTo` query params, confirmed in §3.2). 302-redirect to `returnTo` — enough to exercise the app's post-logout state. |

**No `/__test__/*` endpoints.** An earlier draft of this section had
`/__test__/reset` and `/__test__/set-user` here — dropped, because a test
driver reaching around the UI to poke bespoke server-internals routes isn't
testing the contract a real backend (or a rewrite's replacement mock) would
have to honor; it also means the suite would silently stop testing anything
if pointed at a mock that didn't happen to implement the same bespoke
routes. Both use cases turned out to have better, already-black-box answers:

- **Reset** wasn't actually needed by the E2E suite at all — Playwright
  spawns a fresh server process per run, so the store already starts empty.
  It's only used by *this repo's own* unit tests for this server, which
  construct an `AuthStore` directly and call its plain (non-HTTP) `reset()`
  method between `it()` blocks — the same store the test injects into
  `createMockAuthServer(options, store)`.
- **Varying the login identity** doesn't need a side channel either: the
  login page's own `email` field (real UI, already there) flows into
  `store.setNextLoginUser({email})` inside the normal `POST /authorize`
  handler. A test that wants a specific email just types it into the form,
  like a real user would.

One legitimate gap remained: nothing about the *real* UI naturally produces
a 401, which the session-expiry test (§4 step 20) needs. Rather than add a
resource-server-side "fail on demand" toggle, `/authorize` accepts an
optional `ttl` field (in both the login form's hidden fields and the query
params a fresh request can supply) that overrides `tokenTtlSeconds` for
that one login only. This isn't a standard Auth0 parameter, but it's a real
dimension of token issuance (an IdP can legitimately vary session length)
rather than a test-only backdoor into the resource server: a test that
wants to exercise session expiry logs in a second time requesting
`ttl=2`-ish, waits for that real token to genuinely expire, then performs a
normal UI action and observes the app's real 401-handling — testing actual
expiry, not a simulated failure.

`id_token` is a JWT with header `{"alg":"RS256","typ":"JWT"}` (required
literally, per §3.2) and claims `iss = "http://localhost:4300/"` (trailing
slash required), `aud = <client_id>`, `sub`, `nonce` (echoed from
`/authorize`), `name`, `picture`, `email`, `exp`, `iat` — signed with a
throwaway RSA keypair generated once at process boot (not published via
JWKS; nothing fetches it). `access_token` is a *separate* JWT the SDK never
inspects at all — the mock is free to shape it however the mock API server
finds convenient. As implemented: HS256, claims `{ sub, exp }`, signed with a
plain shared-secret string constant (`web/e2e/servers/shared/secrets.ts`)
both mock server processes import — simpler than sharing an RSA keypair
across two independent processes, since it's just an identical literal, no
runtime handshake needed. This lets the resource-server side (§3.4) do
**real, meaningful** signature+expiry verification (unlike the frontend,
which the SDK deliberately doesn't do) —
this is what makes the 401/session-expiry path (§4, step "Session expiry") a
genuine end-to-end assertion rather than a stub.

### 3.4 Mock API server (`web/e2e/servers/mock-api-server/`)

Runs on its own port (e.g. `4200`). Two responsibilities: a GraphQL-shaped
endpoint at `POST /v1/graphql`, and the two LLM REST endpoints, all backed by
one in-memory store, reset once per Playwright run.

**No real GraphQL engine needed.** The app only ever sends one of a small,
fixed set of named operations (enumerated in Appendix A) — the same
substring-match dispatch the current `test-setup-browser.ts` already uses is
good enough, just moved server-side and made stateful:

```ts
// sketch
const resolvers: Record<string, (vars: any, store: Store) => unknown> = {
  GetEntries: (vars, store) => ({ food_diary_diary_entry: store.entriesInRange(vars) }),
  CreateNutritionItem: (vars, store) => ({ insert_food_diary_nutrition_item_one: store.createItem(vars.nutritionItem) }),
  // ...one entry per operation in Appendix A
};

app.post("/v1/graphql", requireBearerToken, (req, res) => {
  const { query, variables } = req.body;
  const opName = Object.keys(resolvers).find((name) => query.includes(name));
  if (!opName) return res.status(500).json({ errors: [{ message: `mock server: unhandled operation in query: ${query.slice(0, 80)}` }] });
  res.json({ data: resolvers[opName](variables, store) });
});
```

Unhandled operations fail loudly (mirroring the existing MSW "strict mode"
philosophy) so the mock can't silently drift from what the app actually
sends.

**`requireBearerToken` does real verification.** Unlike the frontend SDK
(§3.2), nothing stops this server from properly checking the `access_token`.
As implemented in phase 2 (`web/e2e/servers/mock-auth-server/`), the
`access_token` is a separate, HS256-signed JWT (not RS256 like the
`id_token`) verified with a plain shared-secret string constant from
`web/e2e/servers/shared/secrets.ts` — simpler than sharing an RSA keypair
across the two independent processes, since it's just an identical literal
both files import (no runtime handshake needed). The mock API server imports
the same constant, verifies the HMAC and `exp` claim, and returns `401` on a
missing header, bad signature, or expired token. This real check is what
makes the session-expiry test (§4 step 20, via the auth server's `ttl`
override — see §3.3) and the `AuthorizationError`/logout-on-401 flow an
honest integration test of `Api.ts`'s `fetchQuery` rather than a hand-waved
stub. The `id_token` itself is still RS256 (required by the literal `alg`
header check, §3.2) but its keypair is generated fresh per process boot —
never shared, since nothing outside the SDK's own (never-performed)
signature check touches it.

**In-memory store** (`store.ts`) models exactly the entities the app touches:
`nutritionItems`, `recipes`, `diaryEntries`, `nutritionTargets` — plain
arrays/maps with auto-incrementing ids, matching the shapes in
`web/src/Api.ts`'s TypeScript types. Diary entry `consumed_at` defaults to
the real wall clock (mirroring the real schema's `DEFAULT now()`, confirmed
in `graphql-engine/migrations/default/1664466824542_init/up.sql:6`) when the
caller doesn't supply one — every mutation that actually needs a specific
date (`InsertDiaryEntriesWithNewItems`, `UpdateDiaryEntry`) already accepts
an explicit `consumed_at`, so nothing needs the mock's clock to be
independently controllable.

**No `/__test__/*` endpoints here either**, for the same reason as §3.3: a
test-only HTTP surface that only this mock implements isn't testing the
contract a real backend has to honor. `store` is a plain constructor
parameter (`createMockApiServer(store = new MockApiStore())`) instead, so
this repo's own unit tests construct one directly and call its plain
`reset()` method between `it()` blocks — the same store the test injects
into the server. An earlier draft of this section had `/__test__/reset`,
`/__test__/clock`, `/__test__/force-error`, and `/__test__/dump` here;
none of them turned out to be necessary for the E2E suite itself:

- **Reset**: unnecessary — Playwright spawns a fresh process per run.
- **Clock**: unnecessary — see the `consumed_at` note above.
- **Force-error**: moved to the auth server's `ttl` override (§3.3), which
  produces a real 401 from a real expired token instead of a fake one.
- **Dump**: unnecessary — the E2E test creates all the data it asserts
  against itself (via ids returned from mutations, or values it typed into
  forms), so it never needs to ask the server what it's holding.

**REST endpoints.** Note the paths are `/lookup` and `/upload` at the mock
server's root — matching the real `llm-nutrition-api` service's own route
names, since that's what `/llm/*` and `/labeller/*` resolve to once
`vite.config.mts`'s existing proxy `rewrite` strips those prefixes (§3.1):

- `POST /lookup` — body `{ description }`, returns
  `{ item: { description, calories, total_fat_grams, ... } }` (snake_case,
  matching `lookupNutritionWithLLM`'s parsing in `Api.ts`). Return
  deterministic canned nutrition data derived from the description (e.g. a
  small keyword table plus a stable hash-based fallback) so the assertion in
  the E2E test can check specific numbers.
- `POST /upload` — multipart `image` field, returns
  `{ image: { description, calories, total_fat_grams, cholesterol_mg,
  sodium_mg, total_carbohydrates_g, dietary_fiber_g, total_sugars_g,
  added_sugars_g, protein_g } }`. **Note:** these response keys use a
  different naming convention than `/lookup`'s response
  (`cholesterol_mg` vs. `cholesterol_milligrams`, etc. — compare
  `CameraModal.tsx`'s `getNumericValue(data, "cholesterol_mg")` against
  `Api.ts`'s `lookupNutritionWithLLM` parsing). The mock must faithfully
  reproduce today's real (if inconsistent) contract rather than "fixing" it
  — flag this to the team separately; it's out of scope here.

`requireBearerToken` (above) gates every route on this server — including
the two REST endpoints, not just `/v1/graphql` — returning 401 on a
missing/invalid/expired token, which is what `Api.ts`'s `fetchQuery` and
`registerLogoutHandler` wiring are designed to react to.

### 3.5 Playwright harness

New devDependency: `@playwright/test` (currently `1.62.1` on npm, confirmed;
well past the ~1.42 baseline that introduced the multi-entry `webServer`
array this design relies on — the existing `playwright` package is
the lower-level driver used today by Vitest's browser provider; the test
runner is a separate package). New directory `web/e2e/`:

As landed in phases 2–3 (this differs slightly from the original sketch below —
the router/JWT/secret helpers turned out to be genuinely shared code, so
they live under `servers/shared/` rather than being duplicated per server;
`vitest.config.ts` is the harness's own dedicated Node-environment test
config, deliberately separate from the app's jsdom-based one so these
server-side tests aren't coverage-gated or run as part of `npm test`):

```
web/e2e/
  vitest.config.ts             # dedicated config for these servers' own unit tests (npm run test:e2e:servers)
  playwright.config.ts         # not yet landed (phase 4)
  fixtures/                    # landed phase 4 -- nutrition-label.jpg (CSV fixtures are
                                # generated inline in the test instead; see phase 5's note)
  servers/
    shared/
      httpServer.ts            # tiny exact-match router + body/response helpers, used by both mock servers
      jwt.ts                   # sign/verify HS256 + RS256, decode header/payload (no external JWT library)
      secrets.ts                # ACCESS_TOKEN_SECRET, imported by both processes -- see below
    mock-auth-server/
      index.ts                 # CLI entrypoint: binds PORT (default 4300)
      server.ts                # createMockAuthServer(options, store?) -- unbound http.Server; store is injectable, defaults to a fresh AuthStore
      store.ts                 # in-memory pending-codes map + the "next login" test user profile; plain reset()/setNextLoginUser(), no HTTP route
      loginPage.ts
      __tests__/
        server.test.ts
    mock-api-server/
      index.ts                 # CLI entrypoint: binds PORT (default 4200)
      server.ts                # createMockApiServer(store?) -- wires the router + withAuth wrapper; store is injectable, defaults to a fresh MockApiStore
      auth.ts                  # verifyAccessToken(): real HS256 + exp check against the shared secret
      store.ts                 # in-memory entities + the calorie/protein/added-sugar formulas; plain reset(), no HTTP route
      resolvers.ts              # one function per GraphQL operation, dispatched by name substring
      restHandlers.ts           # canned /lookup and /upload responses
      __tests__/
        server.test.ts
  support/
    login.ts                   # drives the real login page from a Playwright Page
  tests/
    full-app-journey.spec.ts   # the single long test (§4)
```

`playwright.config.ts` sketch (as landed in phase 4, the real config also
sets `outputDir`/`reporter` explicitly — Playwright's defaults for both
resolve relative to the invoking process's `cwd` (`web/`), not this config
file's directory, unlike `testDir`/`webServer.cwd`, confirmed by hitting it —
and adds `launchOptions.args`/`permissions` on the `chromium` project for
the fake camera device, and `npx tsx ...`/`env: {PORT: ...}` on the two mock
server `webServer` entries so each binds the port Playwright expects it on
regardless of the script's own hardcoded default):

```ts
import { defineConfig, devices } from "@playwright/test";

const AUTH_PORT = 4300;
const API_PORT = 4200;
const WEB_PORT = 5173;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,       // one long, stateful journey
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "tsx servers/mock-auth-server/index.ts",
      port: AUTH_PORT,
      reuseExistingServer: false,
    },
    {
      command: "tsx servers/mock-api-server/index.ts",
      port: API_PORT,
      reuseExistingServer: false,
    },
    {
      // Not `npm run serve` (today's `vite preview` alias) — invoke vite
      // directly so the E2E-only port/env don't leak into that script.
      command: "npx vite build && npx vite preview --port 5173 --strictPort",
      cwd: "..",
      port: WEB_PORT,
      reuseExistingServer: false,
      env: {
        FOOD_DIARY_HTTPS: "false",
        FOOD_DIARY_MOCK_SERVER_URL: `http://localhost:${API_PORT}`,
        VITE_AUTH0_DOMAIN: `http://localhost:${AUTH_PORT}`,
        VITE_AUTH0_CLIENT_ID: "e2e-test-client",
      },
    },
  ],
});
```

Using the real production build (`vite build` + `vite preview`) rather than
`vite dev` is deliberate: it's what actually ships, it removes dev-server-only
behaviors (HMR websockets, unminified source, on-demand module compilation)
as variables, and it's the only way a "verify a full rewrite" story makes
sense — a rewrite wouldn't necessarily have a `vite dev` at all.

Two things confirmed against the installed `vite@^8.0.0` itself rather than
assumed:

- **`import.meta.env.VITE_*` values are inlined at `vite build` time**, not
  read live by `vite preview` — so the `env` block above must wrap the whole
  `vite build && vite preview` command (as written), not just the `preview`
  half. Setting these vars only for `preview` would silently build against
  the *production* defaults and then serve that stale build.
- **`vite preview` applies SPA fallback (serves `index.html` for unmatched
  paths) automatically**, with no extra config needed. Confirmed in
  `node_modules/vite/dist/node/chunks/node.js`: `preview()` installs
  `htmlFallbackMiddleware` whenever `config.appType === "spa"`, and
  `appType` defaults to `"spa"` when unset (as it is in this project's
  `vite.config.mts`). This is what makes step 17's page-reload-on-`/profile`
  assertion (and any other direct/reloaded navigation to a nested route)
  work the same way it does in production behind nginx's
  `try_files $uri $uri/index.html /index.html`.

Camera access: launch Chromium with
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (via
`launchOptions.args` in the config, plus granting the `camera` permission on
the browser context) so the "Take Picture" tab produces a real, synthetic
video frame end to end; separately exercise the "Upload Image" tab with the
`nutrition-label.jpg` fixture via `setInputFiles` for a deterministic
assertion, since the fake-device frame content is a fixed synthetic pattern
which is fine for exercising the upload+import wiring but not for asserting
specific nutrition values.

### 3.6 Coverage

The user wants "very high" coverage attributable to this suite alone. Add
`vite-plugin-istanbul` (confirmed on npm at `8.0.0`, whose declared
`peerDependencies.vite` is `>=7` — compatible with this project's
`vite: ^8.0.0`), enabled only when `E2E_COVERAGE=true` is set for the
build step in `playwright.config.ts`'s web-frontend `webServer` entry. At the
end of the single long test, `page.evaluate(() => (window as any).__coverage__)`
and write it to `.nyc_output/e2e.json`; a `posttest:e2e` script runs `nyc
report --reporter=text --reporter=html` against it. Keep this report separate
from the Istanbul-based unit-test coverage already gated in
`vite.config.mts` (`coverage.thresholds`) rather than merging the two — they
answer different questions ("do unit tests exercise this branch" vs. "does a
real user journey reach this line").

### 3.7 `package.json` / CI wiring

New scripts:

```json
"test:e2e": "playwright test --config e2e/playwright.config.ts",
"test:e2e:coverage": "E2E_COVERAGE=true npm run test:e2e && nyc report --reporter=text --reporter=html"
```

`.github/workflows/ci-cd.yml`'s `test-web` job: replace the existing
"Acceptance tests" step (`npm run test:acceptance`) with `npm run test:e2e`
(Playwright's own `webServer` orchestration removes the need for any extra
CI-side process management — `npx playwright install --with-deps chromium`
is already a step). Delete `vitest.acceptance.config.mts`,
`src/acceptance*.test.tsx`, `src/test-setup-browser.ts`, and rewrite
`ACCEPTANCE_TESTS.md` (or fold its content into this doc / a `web/e2e/README.md`)
once the new suite is green.

---

## 4. The test itself: one long, stateful journey

Design principle straight from the request: **one long test, seeding data as
it goes**, structured internally with `test.step(...)` blocks so failures
still localize cleanly in the Playwright HTML report/trace viewer, and with
occasional `expect.soft` only where a later step doesn't depend on an
earlier assertion's outcome. No component is imported, no module is mocked,
no fetch is intercepted in-process — every interaction is a real click/type
against the real running app, and every check that isn't visible in the DOM
is checked against what the test itself already knows it created (an id
returned from an earlier UI action, a value it typed into a form) rather
than by asking either mock server what it's holding — neither has a
`/__test__/*` endpoint to ask (§3.3, §3.4).

`test.describe.serial` with a couple of `test()`s sharing one `page` fixture
(via a manually-scoped fixture, since Playwright tears the `page` down
between `test()`s by default) is the fallback if the file becomes too large
for one function body to stay readable — but the default target is a single
`test("the full app journey", async ({ page }) => { ... })`.

### 4.1 Step outline

1. **Cold start, logged out.** Navigate to `/` (both mock servers already
   start empty — freshly spawned processes, no reset needed). **As landed:**
   `Auth0.ts`'s resource calls `loginWithRedirect()` itself the moment it
   resolves an unauthenticated session, so there's no stable logged-out page
   to assert a "Log In" button on — the fallback button only exists for the
   (here, unreachable) case where that redirect fails. Assert the real
   redirect instead: wait for the URL to land on the mock auth server's
   `/authorize` page.
2. **Login (real PKCE round trip).** Click "Log In" → real full-page
   navigation to the mock auth server's `/authorize` page → fill/submit the
   fake login form → real redirect back to `/auth/callback` with `code`+`state`
   → assert the app lands back on `/` authenticated (avatar visible in
   header). This alone exercises `loginWithRedirect`, the PKCE
   challenge/verifier round trip, `handleRedirectCallback`, and
   `getTokenSilently` resolving from cache — the entire auth surface area
   the current suite fakes away.
3. **Empty diary state.** Assert the empty-state message (mock store has zero
   entries) instead of the hardcoded "Banana" fixture the old suite used.
4. **Add Item flow #1 — manual entry.** Click "Add Item" → fill description
   ("Banana"), calories, protein, fiber, etc. by hand → Save → back on `/`.
5. **Search + log flow.** Click "Add New Entry" → Search tab → type "Banana"
   → assert it appears in results (round-trips through the real
   `SearchItemsAndRecipes`/`SearchItems` query against the mock store) →
   select it, set servings, Save → assert the new diary entry appears in the
   list with correct calories/macros.
6. **Item detail + edit.** Click through to the item's show page, assert
   nutrition facts render, click "Edit Item," change calories, Save, assert
   the diary entry logged in step 5 now reflects the updated value (proves
   the mock's relational join, not just flat storage).
7. **Add Item flow #2 — AI lookup.** Create a second item ("Peanut Butter")
   using the "Estimate with AI" (`LLMLookupModal`) path instead of typing
   values by hand: type a description, trigger lookup, assert the mock
   `/llm/lookup` canned values populate the form, adjust one field, Save.
8. **Add Item flow #3 — camera scan.** Create a third item via `CameraModal`'s
   "Upload Image" tab using the `nutrition-label.jpg` fixture, assert the
   mock `/labeller/upload` response populates the form fields (using its
   differently-named keys, per §3.4's note), Save.
9. **Create a recipe.** "Add Recipe" → name it, add items 1 and 2 from step
   4/7 with per-item servings, set total servings, Save.
10. **Log the recipe.** Add New Entry → Search tab → find the recipe by name
    → log it with servings → assert it appears in the diary list with a
    "RECIPE" badge and correctly divided-by-`total_servings` macros.
11. **Recipe detail + edit.** View the recipe's show page (total calories,
    calories/serving, ingredient breakdown), edit it (change total servings,
    add item 3 from step 8), Save, assert the diary entry from step 10
    recomputes.
12. **Edit a diary entry.** Open the entry from step 5's edit form, change
    servings and the consumed time, Save, assert the list re-sorts/re-groups
    correctly (exercises `DiaryEntryEditForm` + day-grouping/time-sort logic).
13. **Weekly stats + week navigation.** The entries logged so far already
    land in the current week (real wall-clock time, no clock override
    needed). Using the same diary-entry edit UI as step 12, push one
    entry's consumed time back into the previous week (a real, already-
    exercised UI path — no need for the mock to support an independently
    controllable clock). Assert "LAST 7 DAYS"/"4 WEEK AVG" reflect only the
    current week's total, then click "Previous Week" and assert the list
    now shows the pushed-back entry, "Next Week" to come back.
14. **Most-logged + time-based suggestions.** Open "Add New Entry" again;
    assert the "Most Logged" section (backed by `GetTopLoggedItems`) and the
    time-based suggestions section (backed by `TopEntriesAroundHour`,
    naturally around the real current hour, since everything so far was
    logged within the last few minutes of real test execution) now show the
    items logged so far.
15. **Trends page.** Navigate to `/trends`; with entries now logged across
    more than one week, assert the trends chart/section renders (not the
    "no data" empty state) with values consistent with what was logged.
16. **Delete a diary entry.** Delete the entry from step 12 via the list's
    delete action; assert it disappears and daily/weekly totals recompute.
17. **Nutrition targets.** Go to `/profile`, change the daily calorie/protein/
    fiber/added-sugar targets, Save. **Reload the page** (real full navigation,
    not a SPA route change) and assert the edited targets persisted — this
    specifically proves they round-tripped through the mock API's
    `SetNutritionTargets`/`GetNutritionTargets`, not just local component
    state or `localStorage`.
18. **CSV export.** From `/profile`, go to Export, pick "All dates," trigger
    the download, capture it via Playwright's `page.on("download")`, and
    assert the CSV content contains rows matching what the test itself
    tracked as it went (ids and values returned from the mutations/forms in
    earlier steps) — no need to ask either mock server what it's holding.
19. **CSV import.** Go to Import, upload a CSV (containing at least one row
    that creates a brand-new nutrition item inline, exercising
    `insertDiaryEntries`'s nested insert), confirm the preview, import, and
    assert the new entries appear in the diary list. **As landed:** the CSV
    is built inline in the test with a `consumed_at` a couple of days before
    the real "now" and handed to `setInputFiles()` as a buffer, rather than
    a static fixture file — a fixed date would eventually fall outside the
    diary list's rolling "this week" window this step asserts against.
20. **Session expiry / 401 handling.** Log out (via `/profile`'s "Log out"
    button), then log back in via the real login form, this time requesting
    a short `ttl` (e.g. 5s — see §3.3) for this one login only. Wait for
    that real token to genuinely expire (`page.waitForTimeout`), then
    perform any normal authenticated action (e.g. a route change that
    refetches). Assert the app calls the registered logout handler and the
    user is bounced through the mock auth server's `/v2/logout` back to a
    logged-out `/` (Log In button visible again) — a real 401 from a real
    expired token driving a real logout redirect, not a simulated failure;
    this is the one flow `AuthorizationErrorIntegration.test.tsx` currently
    only checks at the component level.
21. **Logout via profile button.** Step 20 already ended logged-out via the
    *automatic* 401 path, so this step exercises the *manual* one instead:
    log back in normally (no `ttl` override), click "Log out" on
    `/profile`, and assert the full redirect through `/v2/logout` and back
    to a logged-out `/`.
22. **Re-login, data persists.** Log in again (step 2's helper, reusable),
    assert previously created items/entries are still present — proves
    session/auth is orthogonal to the data layer in this harness (both are
    independent mock servers) the same way it is in production (Auth0 vs.
    Hasura are unrelated systems).

### 4.2 Explicit non-goals for this suite

- **Pull-to-refresh** (`PullToRefresh.tsx`) — a touch/scroll gesture that's
  brittle to simulate reliably in headless Chromium and is already covered
  at the unit level (`PullToRefresh.test.tsx`). Not repeated here; if step 20
  needs a refetch trigger, use week navigation or a route change instead.
- **Real camera hardware** — the fake-device flag produces a synthetic frame
  sufficient to prove the capture→upload→populate wiring works, not to assert
  specific extracted nutrition values (use the file-upload path for that).
- **TLS/production nginx routing** — covered by the fact that `Api.ts`/
  `CameraModal.tsx` default back to relative paths when the new env vars are
  unset; not re-verified by this suite (would need an actual nginx container
  in front of the mock servers, out of scope here).
- **Cross-browser matrix** — start with Chromium only, matching what's
  already installed/used by the current Vitest browser-mode setup and by CI's
  `playwright install --with-deps chromium`. Firefox/WebKit can be added as
  separate `projects` later if desired.

---

## 5. Appendix A — full operation inventory the mock API server must implement

GraphQL operations (matched by name, per `web/src/Api.ts`):

| Operation | Kind | Notes |
|---|---|---|
| `GetEntries` | query | optional `startDate`/`endDate` variables |
| `GetWeeklyStats` | query | `currentWeekStart`, `todayStart`, `fourWeeksAgoStart` → two calorie sums |
| `SearchItemsAndRecipes` | query | items + recipes matching `search` |
| `SearchItems` | query | items only |
| `GetNutritionItem` | query | by pk |
| `GetRecentEntryItems` | query | limit 5, most recent |
| `TopEntriesAroundHour` | query | `startHour`/`endHour`/n=5 |
| `GetTopLoggedItems` | query | limit 100, client computes frequency |
| `GetRecipe` | query | by pk, with items |
| `ExportEntries` / `ExportEntriesWithDateRange` | query | full fragment incl. macros |
| `GetDiaryEntry` | query | by pk |
| `GetWeeklyTrends` | query | `food_diary_trends_weekly` |
| `GetNutritionTargets` | query | `food_diary_nutrition_target` |
| `CreateNutritionItem` | mutation | insert, returns id |
| `UpdateItem` | mutation | update by pk |
| `CreateDiaryEntry` | mutation | insert (item or recipe reference), returns id |
| `DeleteEntry` | mutation | delete by pk |
| `CreateRecipe` | mutation | nested `recipe_items.data` insert |
| `UpdateRecipe` | mutation | update + delete-then-reinsert recipe items |
| `InsertDiaryEntriesWithNewItems` | mutation | bulk insert, nested new-item creation (CSV import) |
| `UpdateDiaryEntry` | mutation | update servings/consumed_at |
| `SetNutritionTargets` | mutation | upsert on conflict |

REST endpoints: `POST /lookup`, `POST /upload` (see §3.4 for
response shapes, including the naming mismatch between the two).

---

## 6. Rollout phases

1. ✅ Frontend seams (§3.1) — tiny, safe, lands alone.
2. ✅ Mock auth server (§3.3), against the confirmed contract in §3.2, with its
   own small unit tests (e.g. "a valid `/authorize` submission redirects with
   a code," "the token endpoint rejects a mismatched `code_verifier` with
   `400 invalid_grant`," "a reused code is rejected"). 14 tests, all
   passing (including the `ttl` login override — see §3.3); also
   smoke-tested as a real standalone `tsx`-run process with `curl`
   (§3.5's directory listing shows the as-landed layout).
3. ✅ Mock API server (§3.4), with its own small unit tests (one per operation
   in Appendix A is enough; plus a 401 test for `requireBearerToken`).
   32 tests, all passing, covering every operation in Appendix A and the
   derived calorie/protein/added-sugar formulas (verified against the real
   Postgres functions in `graphql-engine/migrations/`, not guessed). No
   `/__test__/*` endpoints on either mock server — see §3.3/§3.4's "No
   `/__test__/*` endpoints" notes; both servers' own unit tests construct
   and reset a store directly instead, and the E2E suite's former
   force-error use case moved to the auth server's `ttl` login override.
   Also verified end-to-end for the first time across all three phases so
   far: built the app with
   `FOOD_DIARY_MOCK_SERVER_URL` pointed at a real standalone mock API
   server process, served it with `vite preview`, drove a real PKCE login
   against a real standalone mock auth server process, and used the
   resulting token to successfully create a nutrition item and call
   `/llm/lookup` through the app's own unchanged relative-path proxy —
   confirming §3.1's phase-1 proxy design and this phase's server work
   compose correctly, not just in isolation.
4. ✅ Playwright harness scaffolding (§3.5–3.7): `e2e/playwright.config.ts`
   wiring all three `webServer` entries, `e2e/support/login.ts`, and the
   `e2e/fixtures/` (`import-entries.csv`, `nutrition-label.jpg` — the latter
   verified to actually decode as a real image in a real browser, not just
   structurally valid bytes). `e2e/tests/full-app-journey.spec.ts` currently
   covers step 1 (cold start) and step 2 (a real PKCE login round trip) as
   its scaffolding-verification smoke test; the rest of §4's outline lands
   in phase 5.

   Getting even this far uncovered two real, pre-existing bugs in the app
   itself — both fixed here, since phase 5 can't proceed without them, and
   both are exactly the kind of thing a real multi-process black-box test
   catches that a mocked-in-process one never could:
   - **`useAuth()` has no shared context** (`web/src/Auth0.ts`) — every
     component that calls it creates its own `Auth0Client` and resource.
     On a fresh login, multiple instances race to redeem the same one-time
     authorization code; the losers' `handleRedirectCallback()` throws
     (code already consumed), and that was unhandled. Fixed by catching it
     and falling through to the `isAuthenticated()`/cache check below,
     which the winner's exchange already populated. Real Auth0's network
     latency likely serializes this in practice; the mock's in-memory speed
     made the race land essentially every time.
   - **`createAuthorizedResource` had no guard against firing with an empty
     token** (`web/src/createAuthorizedResource.ts`) — its Solid resource
     source always returned a truthy object regardless of whether
     `accessToken()` had resolved yet, so the very first fetch on mount
     went out with a blank `Authorization: Bearer` header, 401'd, and
     triggered the app's own logout-on-401 handling — immediately
     logging the user back out right after login. Fixed by returning
     Solid's `false` sentinel (skip this fetch) until a real token exists.

   Also had to add CORS handling to the mock auth server (`e2e/servers/shared/httpServer.ts`,
   now applied to both mock servers): `/oauth/token` is called via XHR from
   the app's own origin, a genuinely different port, which a real browser
   preflights — unlike the GraphQL/REST calls, which only ever go through
   Vite's same-origin proxy (§3.1) and never leave the browser's own origin.
   Both unit-test suites (249 app + 46 harness) and the E2E smoke test pass;
   `tsc`, 100% type-coverage, and `prettier:check` are all clean.
5. ✅ The journey test itself (§4.1's full 22 steps), built up step by step,
   each batch runnable and green before adding the next.
   `e2e/fixtures/import-entries.csv` (phase 4) turned out to be a dead end:
   its fixed date would eventually fall outside the diary list's rolling
   "this week" window the test asserts against, so step 19 instead builds
   the CSV content inline with a date relative to the real clock (same
   principle as every other diary entry in this test) and hands it to
   `setInputFiles()` as a buffer; the static fixture was deleted.

   This phase surfaced one mock-harness gap and one real SDK constraint
   worth documenting (an initial third item, about route-param ids being
   sent to the GraphQL API as strings, turned out not to be an app bug at
   all — real Hasura coerces a numeric string to `Int!` fine, so that's a
   mock strictness gap, not a frontend defect; see below):
   - **`NutritionItemShow.tsx`, `NutritionItemEdit.tsx`, and
     `DiaryEntryEditForm.tsx` pass `params.id` (always a string, from
     `@solidjs/router`) straight through to `fetchNutritionItem`/
     `getDiaryEntry`** without `parseInt`-ing it first, unlike
     `RecipeShow.tsx`/`RecipeEdit.tsx`, which already do. This mock's
     `Map<number, ...>.get("1")` initially rejected that (a string key
     miss), which looked like an app bug and was fixed as one — wrongly:
     real Hasura's GraphQL scalar coercion accepts a numeric string for an
     `Int!` variable, so the frontend's existing (inconsistent, but
     harmless) behavior was correct all along. Reverted the app-side
     `parseInt` calls and `Api.ts`'s tightened signatures; fixed the mock
     instead, coercing with `Number(id)` in `resolveGetNutritionItem`/
     `resolveGetDiaryEntry` to match Hasura's real leniency (with a
     regression test for each, passing a numeric-string id).
   - **The mock auth server's canned user `picture` pointed at a real
     external URL** (`https://example.com/avatar.png`) — harmless against
     real internet access, but the header's `<img src>` then blocks any
     full page navigation's `load` event on outbound network access this
     harness otherwise never needs, and a firewalled CI runner (or this
     sandbox) hangs the request forever with no response to even fail fast
     on. Fixed by replacing it with an inline `data:` URI in
     `mock-auth-server/store.ts`, making the whole harness hermetic
     regardless of network policy.
   - **`getTokenSilently()` cannot be given a short-lived token via a
     `ttl` login override** — confirmed against the SDK's source,
     `_getEntryFromCache` hardcodes a 60-second freshness leeway
     independent of the `DEFAULT_EXPIRY_ADJUSTMENT_SECONDS = 0` used
     elsewhere, so *any* cached token with under 60s of remaining life is
     always treated as stale and triggers an immediate `prompt=none`
     silent-auth iframe attempt — which this mock can't satisfy (no SSO
     session), so it hangs. This isn't an app bug (nothing in `Auth0.ts`
     needed to change) but it invalidates §3.3's `ttl` design note taken at
     face value: a `ttl` under 60s makes *login itself* hang, not just
     expire sooner. Step 20 uses `ttlSeconds: 75` (comfortably over the
     margin, so login succeeds immediately) and waits 77s for genuine
     expiry — the app only calls `getTokenSilently()` once per mount,
     caching the result in a plain signal, so the eventual 401 comes from
     the JWT's own `exp` claim on the next API call, unrelated to that
     cache-freshness heuristic. `playwright.config.ts` now sets an explicit
     `timeout: 300_000` to comfortably cover that wait.

   Two Playwright-locator gotchas worth noting for anyone extending this
   test: `getByText()` matches case-insensitive substrings by default, so
   asserting a "RECIPE" badge needs `{ exact: true }` or it also matches
   "...Recipe" in a name; and `DiaryList.tsx` nests one `<li>` per entry
   inside an outer per-day `<li>` that "contains" the same text, so
   `locator("li").filter({ hasText })` resolves to two elements there (the
   outer one first, in document order) — `.last()` picks the entry row.

   Full suite (`npm run test:e2e`) passed twice in a row locally before
   landing.
6. Coverage wiring (§3.6) — not done. Left for a follow-up: it's additive
   (an alternate coverage report, gated behind `E2E_COVERAGE=true`) and
   isn't a prerequisite for phase 7's CI cutover.
7. ✅ CI cutover (§3.7): `.github/workflows/ci-cd.yml`'s `test-web` job now
   runs `npm run test:e2e` in place of `npm run test:acceptance`. The old
   suite is deleted (`vitest.acceptance.config.mts`, `src/acceptance*.test.tsx`,
   `src/test-setup-browser.ts`, `ACCEPTANCE_TESTS.md`, and the now-unused
   `@vitest/browser-playwright`/`playwright` devDependencies), and
   `web/CLAUDE.md`'s pre-PR checklist and `web/e2e/README.md` point at the
   new suite.

## 7. Open risks

- **Single long test = single point of failure for the whole run.** A bug in
  step 6 blocks steps 7–22 from ever running that CI invocation. Mitigate
  with `test.step` granularity in the trace viewer and by keeping each mock
  server's own small unit tests fast/independent so most regressions are
  caught before the E2E run even starts.
- **Runtime.** A 22-step real-browser journey with two build steps (frontend
  `vite build`) will be slower than the current suite. Consider caching the
  Vite build across CI runs when only test/mock-server code changed.
- **`npm install`'s resolved `@auth0/auth0-spa-js` version may drift from
  `1.22.4`.** `package.json` pins `^1.22.4`; the contract in §3.2 was read
  directly from that exact version's source and should hold for any 1.x
  patch/minor bump (no breaking changes expected within a major version),
  but re-diff `node_modules/@auth0/auth0-spa-js/package.json`'s resolved
  version against this doc if the mock auth server's tests start failing
  after a routine `npm install`/lockfile update.
