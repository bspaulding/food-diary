# Phase 0 — Foundation

**PRD coverage:** §2 (architecture decisions), §3 (system context), §6 (layers,
concurrency, navigation, custom OIDC), §7 (Swift data models), §10 (config/
environments), §11 (Phase 0 row), §13 (zero deps).

**Goal:** A buildable, testable Xcode project with a working login gate. After
this phase, the app launches, presents Auth0 login via `ASWebAuthenticationSession`,
exchanges the code for a Hasura-claims JWT, persists/refreshes the session, and
shows an empty authenticated shell rooted at a `NavigationStack`. No feature
screens yet — those are Phase 1.

> **Testing + CI come first (§1.2).** Before any auth, networking, or model code
> is written, stand up the test target and the GitHub Actions pipeline against a
> trivial walking-skeleton test. This sets the standard for the whole project:
> **every subsequent unit of work lands with tests and a green CI run.** Do
> [`testing.md`](testing.md) §0 and [`ci.md`](ci.md) as the first scaffolding
> step — see §1.2 below — then build the rest of Phase 0 test-first.

> **Blocker:** login cannot be exercised end-to-end until the manual Auth0 setup
> in [`auth0-testflight-setup.md`](auth0-testflight-setup.md) is done. Build the
> code first; verify against the live tenant once that runbook is complete.

---

## 0. Prerequisites

- Xcode 16+ (Swift Testing, iOS 18 SDK).
- The bundle id decision: `com.bspaulding.fooddiary` (per PRD §16.2), scheme
  `com.bspaulding.fooddiary`.
- Read access to the live Auth0 tenant values (domain, native client id) — only
  needed at verification time, not to write the code.

---

## 1. Project creation & structure

Create the project committed under `ios/` (decision #9, #10):

```
ios/
  FoodDiary.xcodeproj
  FoodDiary/            # app target
  FoodDiaryTests/       # Swift Testing unit-test target
  Config/              # .xcconfig files (decision #16)
  README.md
```

Build the directory tree exactly as PRD §6.2 specifies (`App/`, `Auth/`,
`Networking/`, `Models/`, `Repositories/`, `Features/`, `DesignSystem/`, `Util/`).
Phase 0 fills `App/`, `Auth/`, `Networking/`, `Models/`, and the DI container;
the `Features/` folders are created empty (or with placeholder views) and filled
in Phase 1.

**Targets & settings**
- iOS Deployment Target **18.0**; iPhone only; portrait + portrait-upside-down off.
- Swift language mode 6 (or 5 with strict concurrency `complete`) so `@MainActor`/
  `Sendable` boundaries from §6.3 are enforced at compile time.
- Two build configurations beyond defaults are unnecessary; reuse **Debug** and
  **Release** and branch behavior on `#if DEBUG` (decision #16, §10):
  - **Release** → production ingress `https://food-diary.motingo.com`.
  - **Debug** → defaults to production, with an in-app Developer override
    (Phase 1 Profile screen) to point Hasura/sidecars at a LAN host.

### 1.1 Config files (§10, §16.5)

`Config/Shared.xcconfig` (committed, no secrets — client id/domain are public):

```
AUTH0_DOMAIN    = <tenant>.us.auth0.com
AUTH0_CLIENT_ID = <native app client id>
AUTH0_SCHEME    = com.bspaulding.fooddiary
PRODUCT_BUNDLE_IDENTIFIER = com.bspaulding.fooddiary
```

> ⚠️ **xcconfig treats `//` as a comment** (PRD §16.5). Never put a value
> containing `://` here. The **audience** and **redirect URI** are assembled in
> Swift instead (see §3 below).

Surface the three keys into `Info.plist` (`AUTH0_DOMAIN = $(AUTH0_DOMAIN)`, etc.)
and read them via a small typed `AppConfig` loader. Register the custom scheme in
`Info.plist` under `CFBundleURLTypes` with `CFBundleURLSchemes =
[com.bspaulding.fooddiary]` so the OS can route the callback (PRD §16.5).

### 1.2 Walking skeleton — testing + CI **before** any feature code

> **Do this immediately after the project compiles and before §2–§6.** The point
> is to make "tests + green CI" the default state from commit one, so every
> later unit (models, auth, networking) is added test-first against a pipeline
> that already runs. This operationalizes decisions #13 (test scope) and #14 (CI).

1. **Create the `FoodDiaryTests` target** (Swift Testing, Xcode 16+), wired to the
   `FoodDiary` scheme so `xcodebuild test` runs it.
2. **Add one trivial test** (a "walking skeleton", e.g. assert `AppConfig` reads
   the bundled `AUTH0_SCHEME`) so the bundle is non-empty and proves the harness
   and simulator destination work end to end.
3. **Stand up CI now** per [`ci.md`](ci.md): the `test-ios` job
   (macOS runner, iOS 18 simulator, `TZ=America/Los_Angeles`,
   `CODE_SIGNING_ALLOWED=NO`) gated on the `ios/**` paths filter. The **first PR
   that adds the Xcode project must show `test-ios` green** — that is the gate
   that establishes the standard.
4. **Establish the testing conventions** (full matrix in [`testing.md`](testing.md)):
   - Swift Testing (`@Test`/`#expect`), no XCUITest in v1 (minimal scope, #13).
   - Pure logic (`Util/`, decoding, auth crypto) is unit-tested; UI is not.
   - Repositories and the token endpoint are **protocol-backed** so tests inject
     fakes — define the protocols before the concrete impls.
   - Date-sensitive tests assume `TZ=America/Los_Angeles` (matches `web/`).
5. **Build the rest of Phase 0 test-first:** each of §2 (models decode), §3 (PKCE,
   exp, refresh coalescing), §4 (error mapping) ships with its tests in the same
   change, and CI stays green throughout.

After this step the repo has: a compiling app, a runnable (if tiny) test bundle,
and a CI job that runs it on every `ios/**` PR. Everything below is added on top
of that foundation.

---

## 2. Models (`Models/`, PRD §7)

Create the Codable models exactly as in PRD §7 — `NutritionItem`, `RecipeItem`,
`Recipe`, `DiaryEntry`, `NutritionTargets` (with the `.default` static). Notes
driving the implementation:

- **Decimals:** Postgres `numeric` arrives as JSON numbers → decode as `Double`.
  IDs are `Int`. (`calories` is `integer` in the DB for `nutrition_item` but the
  computed `diary_entry.calories`/`recipe.calories` are `numeric`; decode all as
  `Double` to match the web, which treats everything as `number`.)
- **Timestamps:** `timestamptz` ISO-8601 with fractional seconds. Decode with a
  custom `JSONDecoder.dateDecodingStrategy` using an `ISO8601DateFormatter` that
  has `.withFractionalSeconds` (and a fallback formatter without it, since Hasura
  may omit fractional seconds). Display in the device local timezone via the
  `DateHelpers` (Phase 1 / §7).
- **Key mapping:** default decoder uses `keyDecodingStrategy =
  .convertFromSnakeCase` (PRD §7 decision). Where a query uses GraphQL field
  aliases (e.g. `getNutritionItemQuery` aliases to camelCase in `web/src/Api.ts`),
  the response is already camelCase — keep the decoder consistent by aliasing in
  the Swift query strings too, OR rely on `.convertFromSnakeCase` and **not**
  alias. Decision for iOS: **do not alias in queries; request snake_case and let
  `.convertFromSnakeCase` map.** This keeps one decoding rule everywhere.
- **XOR:** `DiaryEntry.nutritionItem` and `.recipe` are both optional; the DB
  `CHECK (has_recipe_xor_item)` guarantees exactly one. Decoding tolerates either.

Put a `Codable` round-trip + golden-JSON decode test stub here; the real golden
tests live with Phase 1 once query shapes are final (`testing.md`).

---

## 3. Auth — custom OIDC client (`Auth/`, PRD §6.5)

This is the highest-risk area; implement it in small, individually testable units.
**The five things to get right (§6.5):** always send `audience`; request
`offline_access`; persist rotated refresh tokens; coalesce concurrent refreshes;
Keychain accessibility `kSecAttrAccessibleAfterFirstUnlock`.

### 3.1 `PKCE.swift` (CryptoKit)
- `codeVerifier`: 32 random bytes (`SecRandomCopyBytes`) → base64url (no padding).
- `codeChallenge = base64url(SHA256(verifier))` via `CryptoKit.SHA256`.
- `state`: random base64url string.
- **Unit-test against known RFC 7636 vectors** (§6.5 tests).

### 3.2 `OIDCClient.swift`
Computed config (assembled in Swift, not xcconfig — §16.5):
- `audience = "https://direct-satyr-14.hasura.app/v1/graphql"` (constant).
- `redirectURI = "\(scheme)://\(domain)/ios/\(bundleId)/callback"`.

`login()` flow (§6.5 steps 1–5):
1. Generate PKCE + `state`.
2. Build the `/authorize` URL with `response_type=code`, `client_id`,
   `redirect_uri`, `scope=openid profile email offline_access`, `audience`,
   `code_challenge`, `code_challenge_method=S256`, `state`. **Unit-test that the
   URL contains every param, correctly percent-encoded** (§6.5 tests).
3. Run `ASWebAuthenticationSession` with the custom scheme as
   `callbackURLScheme`; provide an `ASWebAuthenticationPresentationContextProviding`.
4. On callback: verify `state`, extract `code`. On user-cancel, surface a
   distinct `.cancelled` (not an error toast).
5. POST `/oauth/token` (`grant_type=authorization_code`) with `code`,
   `code_verifier`, `client_id`, `redirect_uri`. Decode `access_token`,
   `refresh_token`, `expires_in`.

`refresh()` — POST `/oauth/token` (`grant_type=refresh_token`); **persist the new
rotated refresh token every time** (§6.5). `logout()` URL builder for
`/v2/logout` (return to the registered logout URL) to clear the Auth0 cookie.

### 3.3 `Keychain.swift`
~60-line wrapper over `Security` (`SecItemAdd`/`Copy`/`Update`/`Delete`). Stores
**only the refresh token**. Accessibility **must** be
`kSecAttrAccessibleAfterFirstUnlock` (§6.5 item 5).

### 3.4 `TokenStore.swift` (actor)
- Holds in-memory `accessToken` + `expiry`; reads refresh token from Keychain.
- `currentToken()` returns a valid access token, refreshing first if expired or
  within a small skew window (e.g. 60s).
- **Expiry source:** decode JWT `exp` (split on `.`, base64url-decode the payload,
  read `exp`) — **no signature check** (§3, §6.5). Fall back to `expires_in`.
  **Unit-test `exp` decoding.**
- **Refresh coalescing:** if multiple callers request a token while expired, only
  **one** `/oauth/token` call runs; others await the same `Task`. Implement with a
  stored `Task<String, Error>?` guarded by the actor. **Unit-test: N concurrent
  callers ⇒ exactly 1 token request** (§6.5 tests, the marquee test).

### 3.5 `AuthService.swift` + `AuthState.swift` (`@Observable`)
- `@Observable @MainActor` facade: `login()`, `logout()`, `currentToken()`
  (delegates to `TokenStore`), and a published `state: .signedOut | .signedIn(User)`.
- On launch: if a refresh token exists in Keychain, attempt a silent refresh →
  `.signedIn`; else `.signedOut`.
- Expose the decoded `id_token`/userinfo (name/email/picture) for the Profile
  screen (Phase 1). The `picture`/`name`/`email` come from the `openid profile
  email` scopes.

---

## 4. Networking (`Networking/`, PRD §6.1, §8)

### 4.1 `APIError.swift`
```
enum APIError: Error {
  case unauthorized              // 401/403 (after refresh failed)
  case graphQL([GraphQLError])   // non-empty GraphQL errors array
  case transport(underlying:)    // other non-2xx / URLError
  case decoding(underlying:)
}
```
Mirror `web/src/Api.ts`: 401/403 → `.unauthorized`; non-empty `errors` →
`.graphQL`; other non-2xx → `.transport`. **Unit-test the mapping** (§12).

### 4.2 `GraphQLClient.swift` (struct/actor, `Sendable`)
- One `execute<T: Decodable>(_ operation: GraphQLOperation) async throws -> T`.
- Builds `POST {GRAPHQL_BASE}/api/v1/graphql`, sets `Authorization: Bearer
  <token>` from `AuthService.currentToken()`, body `{ query, variables }`.
- On `.unauthorized`: trigger `AuthService.logout()` → root routes to login
  (mirrors web `registerLogoutHandler` / `AuthorizationError`, §4.1, §8).
- Decodes the GraphQL envelope `{ data, errors }`, returns typed `data`.
- Base URL resolved from `AppEnvironment` (production by default; debug override).

### 4.3 `Api.swift`
Home for the **query/mutation strings**, mirroring `web/src/Api.ts` 1:1. In
Phase 0, only include what login-gate smoke-testing needs (none strictly), but
establish the pattern: each operation is a `static let` query string + a
`Codable` response struct. Phase 1 fills in all v1 operations (see
`phase-1-core-logging.md` §"GraphQL operations").

---

## 5. App composition (`App/`, PRD §6.1, §6.4)

### 5.1 `AppEnvironment.swift` — DI container
- Holds singletons: `AppConfig`, `AuthService`, `GraphQLClient`, and the five
  repositories (protocol-typed so tests inject doubles — §6.1). Repos are
  defined now as protocols with concrete impls stubbed; Phase 1 implements them.
- Exposes the resolved base URL (prod vs. debug override).

### 5.2 `FoodDiaryApp.swift` (`@main`)
- Creates `AppEnvironment`, injects via `.environment(...)`.
- Roots `RootView`.

### 5.3 `RootView.swift` — login gate (§6.4)
- Switches on `AuthService.state`:
  - `.signedOut` → `LoginView` (a single "Log in" button calling
    `authService.login()`; shows spinner + error).
  - `.signedIn` → `NavigationStack` shell with a typed route enum (§6.4):
    `.itemDetail(id)`, `.itemEdit(id)`, `.recipeDetail(id)`, `.recipeEdit(id)`,
    `.newEntry`, `.editEntry(id)`, `.newItem`, `.newRecipe`. Define the enum and
    `.navigationDestination(for:)` switch now; destinations render placeholders
    until Phase 1.
- Root content in Phase 0 is a placeholder "Diary" screen; the toolbar menu
  (Profile/Settings + add actions) is wired in Phase 1.

---

## 6. Navigation contract (§6.4)

Lock the route enum + `NavigationPath` ownership in a small `Router`
(`@Observable`, held by `RootView`). Forms presented as **sheets** where it reads
better (quick add); detail/edit pushed on the stack. This contract is consumed by
every Phase 1 feature, so finalize the enum cases here.

---

## 7. Concurrency rules (§6.3)

- View models `@MainActor @Observable`; repositories/clients `Sendable` value
  types or actors. `URLSession.data(for:)` for all requests.
- Screen loads via `.task {}` with cancellation on disappear.
- Enforce with strict concurrency checking (set in §1).

---

## 8. Tests delivered in Phase 0

(The test target + CI were stood up first in §1.2; these are the specific tests
added test-first alongside §2–§4. Full matrix in [`testing.md`](testing.md);
Phase 0 owns the auth + error pieces.)
- PKCE challenge vs. RFC 7636 known vectors.
- Authorize-URL construction (all params present + encoded).
- JWT `exp` decoding (base64url payload).
- **Refresh coalescing:** N concurrent `currentToken()` callers ⇒ 1 token request
  (inject a fake token endpoint that counts calls).
- `APIError` mapping: 401/403 → `.unauthorized`; GraphQL `errors` → `.graphQL`.

---

## 9. Definition of Done (Phase 0)

- **The first `ios/` PR lands with the test target + `test-ios` CI job green**
  (§1.2) — the testing/CI standard is in place before feature code.
- `ios/FoodDiary.xcodeproj` builds for an iOS 18 simulator from a clean checkout.
- App launches to a login screen; tapping Log In opens `ASWebAuthenticationSession`.
- After the manual Auth0 setup (`auth0-testflight-setup.md`), a full login
  round-trip returns a **Hasura-claims JWT** (verify `x-hasura-user-id` per §16.6),
  the session persists across relaunch (silent refresh), and logout returns to login.
- A trivial authenticated GraphQL query (e.g. `GetWeeklyStats`) succeeds against
  the live backend.
- Phase 0 unit tests pass locally and in CI (`ci.md`).
- Zero third-party dependencies (decision #13) — only `AuthenticationServices`,
  `CryptoKit`, `Security`, `Foundation`, `SwiftUI`.
</content>
