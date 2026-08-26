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
        │                    │  │  + /__test__ control│  │  fake login page     │
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

### 3.1 Frontend seams (small, behavior-preserving code changes)

Two hardcoded values currently prevent pointing the built app at an arbitrary
mock server URL without also owning a reverse proxy in front of it:

1. **`web/src/Api.ts`** — `const host = "/api/v1/graphql"` is a relative
   path, only resolvable because Vite's dev proxy (or nginx in prod) rewrites
   `/api/*` to Hasura. Change to:

   ```ts
   const host = import.meta.env.VITE_GRAPHQL_URL ?? "/api/v1/graphql";
   ```

   and similarly in `lookupNutritionWithLLM`, replace the literal
   `"/llm/lookup"` with `import.meta.env.VITE_LLM_LOOKUP_URL ?? "/llm/lookup"`.

2. **`web/src/CameraModal.tsx`** — replace the literal `"/labeller/upload"`
   with `import.meta.env.VITE_LLM_UPLOAD_URL ?? "/labeller/upload"`.

   Defaults are unchanged, so production behavior (nginx-fronted, relative
   paths) is untouched. Tests set the three `VITE_*` vars to
   `http://localhost:4200/...`, talking to the mock API server directly, no
   proxy involved.

3. **`web/vite.config.mts`** — make the `basicSsl()` plugin conditional
   (`process.env.FOOD_DIARY_HTTPS !== "false"`), so the E2E build/preview can
   run plain HTTP. `VITE_AUTH0_DOMAIN`/`VITE_AUTH0_CLIENT_ID` are already
   env-driven (`web/src/Auth0.ts`) — no code change needed there. Point
   `VITE_AUTH0_DOMAIN` at `http://localhost:4300` for tests (auth0-spa-js
   accepts a domain that already includes a scheme and uses it verbatim
   instead of prepending `https://`).

None of this is E2E-only scaffolding baked into production code paths beyond
an `?? "<same default as today>"` fallback — safe to land as its own small PR
ahead of the rest, verified by the existing unit tests.

### 3.2 Discovery spike — nail the real Auth0 SDK contract first

`@auth0/auth0-spa-js@^1.22` is used via `createAuth0Client(...)` /
`loginWithRedirect` / `handleRedirectCallback` / `getTokenSilently` /
`getUser` / `logout`. Before writing the mock auth server, spend a short spike
confirming, by reading `node_modules/@auth0/auth0-spa-js/dist/typings` and
source (not currently installed in this analysis sandbox — install once
implementation starts) or by proxying a real login against the app's actual
Auth0 tenant:

- Exact endpoints called: `/authorize`, `/oauth/token`, almost certainly
  `/.well-known/jwks.json` (v1's bundled `idtoken-verifier` validates the
  `id_token` signature, issuer, audience, and `nonce` client-side), and
  `/v2/logout` (used by `App.tsx`'s `client.logout({ returnTo })`).
  `/userinfo` may or may not be called — `getUser()` may just decode the
  cached `id_token` claims.
- Exact required claims/params: PKCE `code_challenge`/`code_challenge_method`
  on `/authorize`, `code_verifier` on the token exchange, `nonce` echoed into
  the `id_token`, `iss` must exactly equal `${domain}/` (trailing slash),
  `aud` must equal `client_id`, `exp`/`iat` bounds.
- Whether a silent-auth iframe (`prompt=none` on `/authorize` inside a hidden
  iframe) is ever triggered in this app's usage. With `cacheLocation:
  "localstorage"` and no `useRefreshTokens`, a *fresh* login only needs the
  full-page `/authorize` → `/oauth/token` round trip once; `getTokenSilently()`
  right after `handleRedirectCallback()` should be served from the client's
  in-memory cache. Confirm this so the mock auth server doesn't need to
  support the iframe/`prompt=none` path for the main flow (still worth a
  minimal 501-with-clear-error handler so a real silent-renewal attempt fails
  loudly instead of hanging).

Write the confirmed contract into a short table appended to this doc before
building §3.3.

### 3.3 Mock auth server (`web/e2e/servers/mock-auth-server/`)

A minimal, from-scratch OIDC/OAuth2 Authorization-Code+PKCE provider — not a
library. Runs on its own port (e.g. `4300`), in-memory only.

**Endpoints:**

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/authorize` | Validate `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`, `nonce`. Serve a tiny static HTML "login" page (one input pre-filled with a test user id/email, one submit button) so Playwright can drive a *real* login interaction rather than an instant bounce. On submit, mint an opaque authorization `code`, store `{code_challenge, redirect_uri, client_id, nonce, user}` server-side keyed by code, redirect to `redirect_uri?code=...&state=...`. |
| `POST` | `/oauth/token` | `grant_type=authorization_code`: look up the stored code, verify `SHA256(code_verifier) base64url == code_challenge`, verify `redirect_uri`/`client_id` match, then respond `{access_token, id_token, token_type: "Bearer", expires_in}`. Codes are single-use; a mismatched verifier or reused code returns `400 invalid_grant` (worth one test asserting the login flow can't be replayed). |
| `GET` | `/.well-known/jwks.json` | JWKS for the RS256 keypair generated at process start. |
| `GET` | `/.well-known/openid-configuration` | Cheap to add; covers a future SDK doing real discovery. |
| `GET` | `/userinfo` | Bearer-token-gated; returns the same profile claims as the `id_token`, in case the SDK calls it. |
| `GET`/`POST` | `/v2/logout` | Auth0's logout endpoint shape (`client_id`, `returnTo` query params). Just redirects to `returnTo` — enough to exercise the app's post-logout state. |
| `POST` | `/__test__/reset` | Test-control only (never called by the app). Clears in-flight authorization codes and resets the default test user's claims. |
| `POST` | `/__test__/set-user` | Test-control only. Overrides the profile claims (`name`, `picture`, `email`, `sub`) returned for the *next* login, so a test step can assert the header renders whatever avatar/name the "logged-in user" carries. |

`id_token`/`access_token` are real signed JWTs (RS256, keypair generated at
process boot) with `iss = http://localhost:4300/`, `aud = <client_id>`,
`sub`, `name`, `picture`, `email`, `nonce`, `exp`. The mock API server
verifies the `access_token`'s signature against `/​.well-known/jwks.json` on
every authenticated request — this is what makes the 401/session-expiry path
(§4, step "Session expiry") a real end-to-end assertion instead of a stub.

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

**In-memory store** (`store.ts`) models exactly the entities the app touches:
`nutritionItems`, `recipes`, `diaryEntries`, `nutritionTargets` — plain
arrays/maps with auto-incrementing ids, matching the shapes in
`web/src/Api.ts`'s TypeScript types. Diary entry `consumed_at` defaults to
the store's current clock (mirroring the real schema's
`DEFAULT now()`, confirmed in
`graphql-engine/migrations/default/1664466824542_init/up.sql:6`) when the
caller doesn't supply one.

**Test-control endpoints** (never called by the app itself — called directly
by the Playwright test over HTTP, the same black-box principle applied to
setup/assertions instead of the UI):

| Path | Purpose |
|---|---|
| `POST /__test__/reset` | Wipe the store back to empty. Called once at global setup. |
| `POST /__test__/clock` | Set/advance the store's simulated "now," so day-grouping and weekly-stats math is deterministic regardless of when the suite runs (avoids needing `TZ=America/Los_Angeles`-style hacks baked into assertions — set the clock to a fixed instant in that zone instead). |
| `POST /__test__/force-error` | Arm the *next* N requests (or requests matching an operation name) to return a given HTTP status — used for the 401/session-expiry test without needing the UI to organically produce one. |
| `GET /__test__/dump` | Return the whole store as JSON — useful for debugging failed runs and for assertions that are awkward to make through the UI (e.g., "was `consumed_at` actually persisted as the edited value"). |

**REST endpoints:**

- `POST /llm/lookup` — body `{ description }`, returns
  `{ item: { description, calories, total_fat_grams, ... } }` (snake_case,
  matching `lookupNutritionWithLLM`'s parsing in `Api.ts`). Return
  deterministic canned nutrition data derived from the description (e.g. a
  small keyword table plus a stable hash-based fallback) so the assertion in
  the E2E test can check specific numbers.
- `POST /labeller/upload` — multipart `image` field, returns
  `{ image: { description, calories, total_fat_grams, cholesterol_mg,
  sodium_mg, total_carbohydrates_g, dietary_fiber_g, total_sugars_g,
  added_sugars_g, protein_g } }`. **Note:** these response keys use a
  different naming convention than `/llm/lookup`'s response
  (`cholesterol_mg` vs. `cholesterol_milligrams`, etc. — compare
  `CameraModal.tsx`'s `getNumericValue(data, "cholesterol_mg")` against
  `Api.ts`'s `lookupNutritionWithLLM` parsing). The mock must faithfully
  reproduce today's real (if inconsistent) contract rather than "fixing" it
  — flag this to the team separately; it's out of scope here.

Auth: every route except `/​__test__/*` and the two `.well-known` endpoints
(if proxied through, though those live on the auth server) requires a valid
bearer token verified against the mock auth server's JWKS, returning 401 on
failure/expiry — this is the same check `Api.ts`'s `fetchQuery` and
`registerLogoutHandler` wiring are designed to react to.

### 3.5 Playwright harness

New devDependency: `@playwright/test` (the existing `playwright` package is
the lower-level driver used today by Vitest's browser provider; the test
runner is a separate package). New directory `web/e2e/`:

```
web/e2e/
  playwright.config.ts
  fixtures/
    import-entries.csv         # for the CSV import flow
    nutrition-label.jpg        # for the camera "Upload Image" flow
  servers/
    mock-auth-server/
      index.ts
      jwt.ts
      login-page.html
    mock-api-server/
      index.ts
      store.ts
      resolvers.ts
  support/
    testControl.ts             # thin HTTP client for the /__test__/* endpoints on both mock servers
    login.ts                   # drives the fake login page from a Playwright Page
  tests/
    full-app-journey.spec.ts   # the single long test (§4)
```

`playwright.config.ts` sketch:

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
      command: "npm run build && npm run preview -- --port 5173",
      cwd: "..",
      port: WEB_PORT,
      reuseExistingServer: false,
      env: {
        FOOD_DIARY_HTTPS: "false",
        VITE_AUTH0_DOMAIN: `http://localhost:${AUTH_PORT}`,
        VITE_AUTH0_CLIENT_ID: "e2e-test-client",
        VITE_GRAPHQL_URL: `http://localhost:${API_PORT}/v1/graphql`,
        VITE_LLM_LOOKUP_URL: `http://localhost:${API_PORT}/llm/lookup`,
        VITE_LLM_UPLOAD_URL: `http://localhost:${API_PORT}/labeller/upload`,
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
`vite-plugin-istanbul`, enabled only when `E2E_COVERAGE=true` is set for the
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
goes through the mock servers' `/__test__/dump` endpoint.

`test.describe.serial` with a couple of `test()`s sharing one `page` fixture
(via a manually-scoped fixture, since Playwright tears the `page` down
between `test()`s by default) is the fallback if the file becomes too large
for one function body to stay readable — but the default target is a single
`test("the full app journey", async ({ page }) => { ... })`.

### 4.1 Step outline

1. **Cold start, logged out.** Reset both mock servers (`__test__/reset`).
   Navigate to `/`. Assert the "Log In" button renders (not authenticated).
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
13. **Weekly stats + week navigation.** Use `/__test__/clock` to fix "now,"
    seed (via the normal UI, from earlier steps) entries that land in both
    the current and a prior week; assert "LAST 7 DAYS"/"4 WEEK AVG" values,
    then click "Previous Week"/"Next Week" and assert the list changes to
    match.
14. **Most-logged + time-based suggestions.** Open "Add New Entry" again;
    assert the "Most Logged" section (backed by `GetTopLoggedItems`) and the
    time-based suggestions section (backed by `TopEntriesAroundHour`, driven
    off the fixed clock from step 13) now show the items logged so far.
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
    assert the CSV content contains rows for every diary entry currently
    live in the mock store (cross-checked against `/__test__/dump`).
19. **CSV import.** Go to Import, upload the `import-entries.csv` fixture
    (containing at least one row that creates a brand-new nutrition item
    inline, exercising `insertDiaryEntries`'s nested insert), confirm the
    preview, import, and assert the new entries appear in the diary list.
20. **Session expiry / 401 handling.** Arm `/__test__/force-error` on the
    mock API server for the next request, trigger any authenticated action
    (e.g. pull-to-refresh substitute: click into a route that refetches),
    assert the app calls the registered logout handler and the user is
    bounced through the mock auth server's `/v2/logout` back to a logged-out
    `/` (Log In button visible again). This is the one flow
    `AuthorizationErrorIntegration.test.tsx` currently only checks at the
    component level — here it's a real 401 from a real server driving a real
    logout redirect.
21. **Logout via profile button** (if not already logged out by step 20 —
    order these so both paths get exercised; e.g. re-login first). Click
    "Log out" on `/profile`, assert the full redirect through
    `/v2/logout` and back to a logged-out `/`.
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

REST endpoints: `POST /llm/lookup`, `POST /labeller/upload` (see §3.4 for
response shapes, including the naming mismatch between the two).

---

## 6. Rollout phases

1. Frontend seams (§3.1) — tiny, safe, lands alone.
2. Discovery spike (§3.2) — confirms the exact Auth0 contract before building
   against assumptions.
3. Mock auth server (§3.3), with its own small unit tests.
4. Mock API server (§3.4), with its own small unit tests.
5. Playwright harness scaffolding (§3.5–3.7): config, fixtures, support
   helpers, empty `webServer` wiring — verify all three processes boot and
   the app loads logged-out.
6. The journey test itself (§4), built up step by step, each step runnable
   and green before adding the next.
7. Coverage wiring (§3.6).
8. CI cutover + delete the old suite (§3.7's last paragraph).

## 7. Open risks

- **Auth0 SDK internals are assumed, not yet confirmed** (§3.2) — the
  biggest unknown; budget real time for the spike before committing to the
  mock auth server's exact response shapes.
- **Single long test = single point of failure for the whole run.** A bug in
  step 6 blocks steps 7–22 from ever running that CI invocation. Mitigate
  with `test.step` granularity in the trace viewer and by keeping each mock
  server's own small unit tests fast/independent so most regressions are
  caught before the E2E run even starts.
- **Runtime.** A 22-step real-browser journey with two build steps (frontend
  `vite build`) will be slower than the current suite. Consider caching the
  Vite build across CI runs when only test/mock-server code changed.
