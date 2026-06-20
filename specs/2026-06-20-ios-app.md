# Food Diary — iOS App PRD

**Status:** Draft for implementation
**Author:** Brad Spaulding
**Last updated:** 2026-06-20
**Target:** Native iOS port of the Food Diary web front end (`web/`)

---

## 1. Overview

Food Diary is a food-journaling app currently delivered as a SolidJS web app at
[food-diary.motingo.com](https://food-diary.motingo.com), backed by a Hasura
GraphQL API plus two Rust sidecar services (OCR nutrition-label parsing and LLM
nutrition lookup). This document specifies a **native iOS client** written in
**Swift + SwiftUI** that reuses the existing backend unchanged (with one small
additive backend change for nutrition targets, see §9).

The iOS app is a **client of the same backend** as the web app. No business data
moves; the iOS app authenticates the same user against the same Hasura instance
and reads/writes the same rows (scoped per-user via `X-Hasura-User-Id`).

### 1.1 Goals

- Ship a native, idiomatic iOS app for personal use via TestFlight.
- Achieve **core food-logging parity** with the web app in v1 (see §4).
- Lay an architecture that makes later phases (trends, label scanning, LLM
  lookup, CSV) straightforward additive work.
- Reuse the existing Hasura/Auth0 backend with minimal backend changes.

### 1.2 Non-goals (v1)

- App Store public release (architected to allow it later, but not a v1 target).
- Offline-first editing / mutation queue.
- iPad-optimized adaptive layouts.
- Trends/charts, CSV import/export, camera label scanning, LLM lookup
  (all deferred to later phases — see §11).

---

## 2. Architecture Decisions (locked)

These were settled during the planning interview and drive the rest of the doc.

| # | Decision | Choice | Notes |
|---|---|---|---|
| 1 | Distribution | **Personal / TestFlight** | No App Store review constraints in v1. |
| 2 | Min deployment target | **iOS 18+** | Use latest `@Observable`, SwiftData (if needed later), modern Swift Charts. |
| 3 | v1 feature scope | **Core logging first** | Diary list, entries, items, recipes, search, suggestions, targets. |
| 4 | App architecture | **MVVM + `@Observable`** | Views → `@Observable` view models → service/repository layer. |
| 5 | GraphQL transport | **URLSession + Codable** | Hand-written query strings (mirrors web), no codegen, zero deps. |
| 6 | Authentication | **Custom OIDC client (zero deps)** | Hand-rolled Authorization Code + PKCE via `ASWebAuthenticationSession`; own Keychain wrapper. Reuses existing Auth0 tenant. See §6.5. |
| 7 | Persistence / offline | **Online-only** | Fetch on demand, no local store (matches current web behavior). |
| 8 | Nutrition targets storage | **Store on server** | New additive Hasura table keyed by `user_id` (see §9). |
| 9 | Repo location | **`ios/` in this monorepo** | Alongside `web/`, `graphql-engine/`, etc. |
| 10 | Project tooling | **Plain Xcode project** | `.xcodeproj` committed; SPM available if a dep is ever needed (v1 has none — see §13). |
| 11 | Device support | **iPhone only** | Portrait-first; runs scaled on iPad. |
| 12 | Visual design | **Native base + custom accents** | HIG foundations + signature macro rings/colors. |
| 13 | Testing | **Minimal** | Unit-test critical calculations + API decoding only. |
| 14 | CI | **GitHub Actions (build + test)** | Matches repo CI conventions. |
| 15 | Top-level navigation | **Single `NavigationStack`** | Rooted at diary list; toolbar menu for profile/settings. |
| 16 | Backend targeting | **Configurable (build config)** | Switch local/dev ↔ production via build configuration. |

---

## 3. System Context

```
┌─────────────────┐         ┌──────────────────────────────────────┐
│   iOS App        │         │            Backend (unchanged)        │
│  (SwiftUI)       │         │                                        │
│                  │  HTTPS  │  ┌──────────────┐  Hasura GraphQL      │
│  URLSession ─────┼────────┼─▶│ /api/v1/graphql (JWT, per-user RLS) │
│  (Bearer JWT)    │  Bearer │  └──────────────┘                      │
│                  │  JWT    │  └─▶ /labeller/upload  (Rust OCR) [later]│
│  OIDCClient ─────┼────────┼─▶ /llm/lookup       (Rust LLM)  [later] │
│  (ASWebAuth +    │         │                                        │
│   PKCE) ◀────────┼────────┼─▶ Auth0 (OIDC authorize/token endpoints)│
└─────────────────┘         └──────────────────────────────────────┘
```

- **Auth:** Auth0 OIDC via a **custom Authorization Code + PKCE client** (no SDK).
  Audience `https://direct-satyr-14.hasura.app/v1/graphql`. The access token is a
  JWT containing Hasura claims (`x-hasura-user-id`, `x-hasura-default-role: user`,
  allowed roles). The same token authorizes Hasura, the labeller, and the LLM
  service via the ingress. **The client never validates the token** — Hasura is
  the verifier; the app treats the access token as an opaque bearer and only
  decodes `exp` for refresh timing. See §6.5 for the full flow.
- **Data scoping:** Every table has a `user_id text NOT NULL` column. Hasura
  `user` role permissions filter all reads/writes by
  `user_id _eq X-Hasura-User-Id` and auto-set `user_id` on insert. The iOS app
  never sends `user_id` — it is derived from the JWT server-side, exactly like
  the web app.

---

## 4. Feature Scope — v1 (Core Logging)

### 4.1 Authentication & session
- Log in via Auth0 using the custom OIDC client (in-app `ASWebAuthenticationSession`
  flow, §6.5).
- Persist session across launches (refresh token in Keychain); silent token
  refresh on expiry.
- Log out (clears tokens + optionally the Auth0 session cookie, returns to login).
- On any `401/403` from the API that survives a refresh attempt, treat the session
  as invalid and route to login (mirrors the web app's `AuthorizationError` →
  logout behavior).

### 4.2 Diary list (home)
- Weekly-paginated list of diary entries, newest week first; "Previous Week" /
  "Next Week" paging. Page 0 = today + previous 6 days; each page is 7 days.
- Entries grouped by **local day**, days sorted descending, entries within a day
  sorted ascending by `consumed_at`.
- Per-day macro summary using **progress rings**: Calories (target + max),
  Protein (g), Fiber (g), Added Sugar (g, treated as a limit).
- Per-entry row: calories, protein, fiber, serving count, time, item/recipe name,
  a "RECIPE" badge when applicable, and edit/delete affordances.
- Header summary band: "Last 7 Days" avg kcal/day and "4-Week Avg" kcal/day
  (from the `_aggregate` query). "View Trends" link is deferred/hidden in v1.
- Delete entry with optimistic removal + rollback on failure.

### 4.3 Add / edit diary entry
- Create an entry referencing an existing nutrition item **or** recipe, with a
  serving count and consumed-at timestamp.
- Item/recipe selection via **search** (typeahead over
  `search_nutrition_items` + `search_recipes`).
- **Suggestions** to speed logging: recent entries, top entries around the
  current hour, and most-logged items (the web app's suggestion sources).
- Edit an existing entry's servings and consumed-at.
- Delete from the edit screen.

### 4.4 Nutrition items
- Create a nutrition item with the full macro set (calories, fats incl.
  saturated/trans/poly/mono, cholesterol mg, sodium mg, total carbs, fiber,
  total sugars, added sugars, protein).
- View a nutrition item (detail with macros).
- Edit a nutrition item.
- (Camera label scan and LLM autofill on this form are **deferred** — the form
  ships with manual entry in v1.)

### 4.5 Recipes
- Create a recipe: name, total servings, and a list of recipe items (each an
  existing nutrition item + servings).
- View a recipe (detail with computed calories and constituent items).
- Edit a recipe (update attrs; replace recipe items).

### 4.6 Nutrition targets
- View/edit targets: calories, calories max, protein g, fiber g, added sugar g.
- Targets drive the diary-list rings.
- **Stored on the server** (new table, §9) so web and iOS stay in sync. Defaults
  match the web app: 2000 kcal / 2400 max / 130 P / 25 fiber / 25 added sugar.

### 4.7 Profile / settings
- Show the Auth0 user (name/email/picture).
- Edit nutrition targets.
- Backend environment switcher (debug builds only, §10).
- Log out.

---

## 5. Out of Scope for v1 (planned later — §11)

Trends/weekly charts • CSV import • CSV export • camera nutrition-label scan
(`/labeller/upload`) • LLM nutrition lookup (`/llm/lookup`) • offline cache •
iPad adaptive layouts • widgets/Shortcuts/HealthKit.

---

## 6. Technical Architecture

### 6.1 Layers (MVVM + `@Observable`)

```
View (SwiftUI)
  └─ binds to → ViewModel (@Observable, @MainActor)
        └─ calls → Service/Repository (async)
              └─ uses → GraphQLClient (URLSession + Codable)
                    └─ gets token from → AuthService (custom OIDC, §6.5)
```

- **Views** are thin and declarative. No networking in views.
- **ViewModels** are `@Observable`, `@MainActor`, own screen state
  (`loading`/`loaded`/`error`), expose intent methods (`load()`, `save()`,
  `delete()`), and call services. One VM per screen.
- **Services / Repositories** are protocol-backed (`DiaryRepository`,
  `NutritionItemRepository`, `RecipeRepository`, `SearchRepository`,
  `TargetsRepository`). Concrete impls wrap `GraphQLClient`. Protocols enable
  test doubles.
- **GraphQLClient** is a single struct/actor that performs the POST, injects the
  bearer token, decodes `data`, and maps GraphQL/HTTP errors to typed Swift
  errors (`APIError.unauthorized`, `.graphQL([GraphQLError])`, `.transport`).
- **AuthService** wraps the custom `OIDCClient` (§6.5): `login()`, `logout()`,
  `currentToken()` (with refresh), and publishes auth state to the app root.

### 6.2 Project structure

```
ios/
  FoodDiary.xcodeproj
  FoodDiary/
    App/
      FoodDiaryApp.swift          # @main, root, auth gate
      AppEnvironment.swift        # DI container, base-URL config
      RootView.swift              # login gate → NavigationStack
    Auth/
      AuthService.swift           # @Observable; login/logout/currentToken
      OIDCClient.swift            # Authorization Code + PKCE (ASWebAuthenticationSession)
      PKCE.swift                  # verifier/challenge (CryptoKit)
      TokenStore.swift            # actor: in-memory tokens + refresh coalescing
      Keychain.swift              # ~60-line Keychain wrapper (refresh token)
      AuthState.swift
    Networking/
      GraphQLClient.swift
      APIError.swift
      Api.swift                   # query/mutation strings (mirrors web/src/Api.ts)
    Models/
      DiaryEntry.swift
      NutritionItem.swift
      Recipe.swift
      NutritionTargets.swift
      SearchResult.swift
    Repositories/
      DiaryRepository.swift
      NutritionItemRepository.swift
      RecipeRepository.swift
      SearchRepository.swift
      TargetsRepository.swift
    Features/
      Diary/      (DiaryListView, DiaryListViewModel, DayMacroSummary…)
      Entry/      (NewEntryView, EditEntryView, EntryFormViewModel, SearchField…)
      Items/      (ItemDetailView, ItemFormView, ItemFormViewModel)
      Recipes/    (RecipeDetailView, RecipeFormView, RecipeFormViewModel)
      Targets/    (TargetsView, TargetsViewModel)
      Profile/    (ProfileView)
    DesignSystem/
      MacroRing.swift             # the signature progress ring
      DateBadge.swift
      Theme.swift                 # colors/spacing (custom accents)
    Util/
      MacroCalculations.swift     # entry/recipe macro math (unit-tested)
      WeeklyStats.swift           # daily-average / 4-week math (unit-tested)
      DateHelpers.swift           # local-day grouping, ISO formatting
  FoodDiaryTests/                 # Swift Testing unit tests
  README.md
```

### 6.3 Concurrency
- `async/await` throughout. `URLSession.data(for:)` for requests.
- ViewModels are `@MainActor`; repositories/clients are actor-isolated or
  `Sendable` value types. Use `.task {}` modifiers for screen loads, with
  cancellation on disappear.

### 6.4 Navigation
- Single `NavigationStack` with a typed `NavigationPath` / route enum
  (`.itemDetail(id)`, `.itemEdit(id)`, `.recipeDetail(id)`, `.recipeEdit(id)`,
  `.newEntry`, `.editEntry(id)`, `.newItem`, `.newRecipe`).
- Root = diary list. A toolbar menu exposes Profile/Settings and the add actions
  (New Entry / New Item / New Recipe), mirroring the web's top buttons.
- Modal sheets used for forms where it reads more naturally (e.g. quick add).

### 6.5 Authentication — custom OIDC client (zero dependencies)

The app is a **public OAuth client** using the **Authorization Code flow with
PKCE**. It obtains and refreshes tokens and attaches the access token as a bearer.
It does **not** validate tokens (Hasura does that), which removes the hard parts
of OIDC (JWKS signature verification, nonce checks). Everything below uses only
system frameworks: `AuthenticationServices`, `CryptoKit`, `Security`, `Foundation`.

**Login flow**
1. Generate PKCE `code_verifier` (32 random bytes, base64url) and
   `code_challenge = base64url(SHA256(verifier))`; generate a random `state`.
2. Open `ASWebAuthenticationSession` at Auth0 `/authorize` with:
   `response_type=code`, `client_id`, `redirect_uri` (custom scheme),
   `scope=openid profile email offline_access`,
   `audience=https://direct-satyr-14.hasura.app/v1/graphql` (**required** — without
   it Auth0 returns an opaque token, not a Hasura-claims JWT),
   `code_challenge`, `code_challenge_method=S256`, `state`.
3. The OS handles the browser/cookies and returns to the `redirect_uri`. Verify
   `state` matches, extract `code`.
4. POST to `/oauth/token` (`grant_type=authorization_code`) with `code`,
   `code_verifier`, `client_id`, `redirect_uri`. Receive `access_token`,
   `refresh_token`, `expires_in`.
5. Persist the refresh token in Keychain; hold the access token + expiry in the
   `TokenStore` actor; publish authenticated state.

**Token use & refresh**
- `currentToken()` returns a valid access token, refreshing first if it's expired
  or within a small skew window. Expiry is read from the JWT `exp` claim (base64
  decode, **no signature check**) or `expires_in`.
- Refresh = POST `/oauth/token` (`grant_type=refresh_token`). **Auth0 rotates
  refresh tokens for native clients** → persist the *new* refresh token returned
  on every refresh.
- The `TokenStore` actor **coalesces concurrent refreshes**: if several requests
  hit a 401 at once, only one refresh runs; the rest await its result.
- A 401/403 that survives a refresh attempt → clear tokens, publish signed-out,
  route to login.

**Logout**
- Clear Keychain + in-memory tokens. Optionally open the Auth0 `/v2/logout`
  (or end-session) URL in `ASWebAuthenticationSession` to clear the Auth0 session
  cookie so the next login isn't auto-completed.

**The five things to get right** (the only risk concentration):
1. Always send the `audience` param (JWT vs opaque token).
2. Request `offline_access` (no scope → no refresh token).
3. Persist rotated refresh tokens on every refresh.
4. Serialize/coalesce concurrent refreshes (the `TokenStore` actor).
5. Keychain item accessibility: `kSecAttrAccessibleAfterFirstUnlock`.

**Tests (added to the mandatory set, §12):** PKCE challenge derivation vs known
vectors; authorize-URL construction (params present/encoded); JWT `exp` decoding;
refresh-coalescing (N concurrent callers → 1 token request).

---

## 7. Data Models (Swift)

Mirror the web's TypeScript types. Decimals in Postgres (`numeric`) arrive as
JSON numbers; decode as `Double`. IDs are `Int`. Timestamps are
`timestamptz` ISO-8601 strings; keep as `Date` decoded with a fractional-seconds
ISO formatter, format for display in the device's local timezone.

```swift
struct NutritionItem: Codable, Identifiable, Hashable {
    let id: Int
    var description: String
    var calories: Double
    var totalFatGrams: Double
    var saturatedFatGrams: Double
    var transFatGrams: Double
    var polyunsaturatedFatGrams: Double
    var monounsaturatedFatGrams: Double
    var cholesterolMilligrams: Double
    var sodiumMilligrams: Double
    var totalCarbohydrateGrams: Double
    var dietaryFiberGrams: Double
    var totalSugarsGrams: Double
    var addedSugarsGrams: Double
    var proteinGrams: Double
}

struct RecipeItem: Codable, Identifiable, Hashable {
    let id: Int
    var servings: Double
    var nutritionItem: NutritionItem
}

struct Recipe: Codable, Identifiable, Hashable {
    let id: Int
    var name: String
    var calories: Double
    var totalServings: Int
    var recipeItems: [RecipeItem]
}

struct DiaryEntry: Codable, Identifiable, Hashable {
    let id: Int
    var consumedAt: Date
    var calories: Double
    var servings: Double
    var nutritionItem: NutritionItem?   // xor recipe (DB CHECK enforces)
    var recipe: Recipe?
}

struct NutritionTargets: Codable, Hashable {
    var calories: Double
    var caloriesMax: Double
    var proteinGrams: Double
    var dietaryFiberGrams: Double
    var addedSugarsGrams: Double

    static let `default` = NutritionTargets(
        calories: 2000, caloriesMax: 2400, proteinGrams: 130,
        dietaryFiberGrams: 25, addedSugarsGrams: 25)
}
```

**Key mapping note:** the Hasura schema uses `snake_case`. Either use
`JSONDecoder.keyDecodingStrategy = .convertFromSnakeCase`, or use GraphQL field
aliases in the query (as the web app does for `getNutritionItemQuery`). Decision:
**use `.convertFromSnakeCase`** as the default and reserve aliases for the
nested computed/aliased fields where it's cleaner. `CodingKeys` override on a
per-field basis where needed.

### 7.1 Macro calculations (ported, must be unit-tested)

Port these exactly from `web/src/DiaryList.tsx` and
`web/src/WeeklyStatsCalculations.ts`:

- `recipeTotal(for:recipe:)` — sum of `item.servings * item.macro` divided by
  `max(total_servings, 1)`.
- `entryTotal(for:entry:)` — `entry.servings * (itemMacro + recipeTotal)`.
- `dayTotal(for:entries:)` — sum across a day's entries.
- `calculateDailyAverage(total, days)` and `calculateFourWeeksDays(now)` for the
  header averages.

These are the highest-value unit tests (numeric correctness) and the only tests
mandated in the v1 "minimal" testing scope (§12).

---

## 8. API / GraphQL Contract (reused from web)

The iOS app issues the same operations the web app does (`web/src/Api.ts`).
All go to `POST {GRAPHQL_BASE}/api/v1/graphql` with
`Authorization: Bearer <token>`.

**Queries (v1):**
- `GetEntries` (all / from-date / date-range variants) — diary list paging.
- `GetWeeklyStats` — `_aggregate` sums for 7-day and 4-week averages.
- `SearchItemsAndRecipes` / `SearchItems` — typeahead.
- `GetRecentEntryItems`, `TopEntriesAroundHour`, top-logged items — suggestions.
- `GetNutritionItem`, `GetRecipe`, `GetDiaryEntry` — detail/edit loads.

**Mutations (v1):**
- `CreateNutritionItem`, `UpdateItem`.
- `CreateRecipe`, `UpdateRecipe` (delete-then-insert recipe items, as web does).
- `CreateDiaryEntry`, `UpdateDiaryEntry`, `DeleteEntry`.
- Targets get/set (new — §9).

**Deferred (later phases):** `ExportEntries*`, `InsertDiaryEntriesWithNewItems`
(CSV import), `GetWeeklyTrends`, `/labeller/upload`, `/llm/lookup`.

**Error handling:** Map `401/403` → `APIError.unauthorized` → sign out + route to
login. Map a non-empty GraphQL `errors` array → `APIError.graphQL`. Other non-2xx
→ `APIError.transport`. Surface user-facing messages on form/list screens.

---

## 9. Backend Change: Nutrition Targets on Server

This is the **only** backend change required for v1 (decision #8). It is purely
additive and does not affect the web app until the web app opts in.

**Migration (`graphql-engine/migrations`):** add a per-user settings table.

```sql
CREATE TABLE food_diary.nutrition_target (
    user_id text NOT NULL PRIMARY KEY,
    calories numeric NOT NULL DEFAULT 2000,
    calories_max numeric NOT NULL DEFAULT 2400,
    protein_grams numeric NOT NULL DEFAULT 130,
    dietary_fiber_grams numeric NOT NULL DEFAULT 25,
    added_sugars_grams numeric NOT NULL DEFAULT 25,
    updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Hasura metadata:** track the table; add `user` role permissions:
- **select/update/delete:** `filter: { user_id: { _eq: X-Hasura-User-Id } }`.
- **insert:** `set: { user_id: x-hasura-User-Id }`, `check` on `user_id`.
- Use `insert ... on_conflict` (upsert on `user_id`) for the save path so the app
  can save without first checking existence.

**App behavior:** on launch, fetch the row; if none, use `NutritionTargets.default`
and create on first save. Targets are cached in memory for the session
(online-only; no local persistence).

**Follow-up (not blocking iOS):** migrate the web app from `localStorage` to this
table for true cross-platform sync. Tracked as a separate task in `web/`.

---

## 10. Configuration & Environments

- **Base URLs** resolved from build configuration (decision #16):
  - **Release/TestFlight:** production ingress (`https://food-diary.motingo.com`)
    serving `/api/v1/graphql`, `/labeller/*`, `/llm/*`.
  - **Debug:** default to production, with an in-app (Profile → Developer)
    override to point at a local/dev host (e.g. a Mac on the LAN) for the Hasura
    and sidecar endpoints.
- **Auth0 config** (`domain`, `clientId`, `audience`, `redirectUri`) supplied via
  `.xcconfig` / `Info.plist` keys, not hard-coded in source. Audience matches the
  web app. This requires a **manual, one-time setup in the Auth0 dashboard** —
  full step-by-step instructions are in **§16**, and the post-build reminder
  checklist is in **§17**. In short: a Native Auth0 application with a
  custom-scheme callback registered in both Auth0 and `Info.plist`, and refresh
  token rotation enabled.
- **Secrets:** no API keys or client secret ship in the app — a Native app is a
  *public* client (no secret), which is exactly why PKCE is used. The labeller/LLM
  services authorize via the user's JWT.

---

## 11. Roadmap / Phasing

| Phase | Theme | Contents |
|---|---|---|
| **0** | Foundation | Xcode project, CI, `GraphQLClient`, custom `OIDCClient`/`AuthService` (§6.5), models, DI, login gate, base navigation. (No third-party deps.) **Requires the manual Auth0 setup in §16 before login works — see §17.** |
| **1 (v1)** | Core logging | Diary list + rings + paging + weekly averages; add/edit/delete entry with search & suggestions; item create/view/edit; recipe create/view/edit; targets (server); profile/logout. |
| **2** | Insights | Trends screen with **Swift Charts** (`GetWeeklyTrends`). |
| **3** | Native capture | Camera nutrition-label scan via `/labeller/upload` (+ optional on-device Vision pre-pass); LLM autofill via `/llm/lookup` on item form. |
| **4** | Data portability | CSV import (`InsertDiaryEntriesWithNewItems`) and CSV export (`ExportEntries*`) using the share sheet / Files. |
| **5+** | Platform polish | iPad adaptive layouts, read cache (SwiftData) for instant loads/offline reads, widgets/Shortcuts, HealthKit, App Store readiness. |

---

## 12. Testing & Quality

- **Framework:** Swift Testing (Xcode 16+, iOS 18 target).
- **Mandatory v1 coverage (minimal scope, decision #13):**
  - `MacroCalculations` — entry/recipe/day macro math vs known fixtures
    (port the web app's calculation test cases for parity).
  - `WeeklyStats` — daily average + 4-week-days math.
  - `GraphQLClient` decoding — golden JSON → model decoding for each operation,
    including snake_case mapping and the item/recipe XOR.
  - Error mapping — `401/403` → `unauthorized`; GraphQL `errors` → `.graphQL`.
  - Auth (§6.5) — PKCE challenge vs known vectors, authorize-URL params,
    JWT `exp` decoding, and refresh coalescing (N concurrent callers → 1 refresh).
- **Manual test plan:** login/logout, log an item entry, log a recipe entry,
  edit servings/time, delete with rollback, create item, create recipe, change
  targets and confirm rings update, week paging, expired-token → re-login.
- **CI (decision #14):** GitHub Actions workflow (`.github/workflows`) that builds
  the app and runs the unit test bundle on PRs touching `ios/`, using
  `xcodebuild`/`xcrun simctl` on a `macos` runner with an iOS 18 simulator.
  `TZ=America/Los_Angeles` set for date-sensitive tests (matches `web/`).

---

## 13. Dependencies

- **None.** v1 is zero third-party dependencies. Auth uses the custom OIDC client
  (§6.5) on `AuthenticationServices` + `CryptoKit` + `Security`.
- Everything else uses the system SDK: SwiftUI, `URLSession`, `Codable`,
  Swift Charts (phase 2), VisionKit/AVFoundation (phase 3).

---

## 14. Risks & Open Questions

| Risk / question | Impact | Mitigation / proposal |
|---|---|---|
| Auth0 Native app + callback URL not yet configured | Blocks login (needed as soon as the Phase 0 login flow is tested) | Manual one-time setup per §16; tracked in the §17 checklist. Reuses the existing tenant/audience. |
| Custom OIDC client gotchas (audience, offline_access, refresh rotation, refresh races, Keychain accessibility) | Broken login/refresh; surprise logouts | The five items in §6.5 are explicitly tested and reviewed; refresh coalescing via a dedicated actor. Owning auth means owning future security patches — surface is small (Auth Code + PKCE is stable; OS provides ASWebAuthenticationSession). |
| `numeric` decimals decoding/rounding parity with web | Wrong macro totals | Decode as `Double`; port web rounding (`Math.round`/`Math.ceil`) precisely; cover with unit tests. |
| Targets table migration coordination with web | Web still uses localStorage | Ship table additively; web migration is a separate, non-blocking follow-up. |
| Timezone-dependent day grouping | Off-by-one day bugs | Reuse the web's local-day logic; test with `TZ` pinned; group by local `startOfDay`. |
| Online-only UX on poor connectivity | Friction | Clear loading/error/retry states in v1; SwiftData read cache is the planned phase-5 fix. |
| Backend ingress auth for labeller/LLM from native client | Phase 3 only | Confirm the same Bearer JWT is accepted by `/labeller` and `/llm` via ingress before building Phase 3. |

---

## 15. Definition of Done (v1)

- A signed TestFlight build installs and runs on iOS 18+ iPhone.
- User can log in/out via Auth0 and the session survives relaunch.
- Diary list renders weekly pages with correct per-day macro rings and 7-day /
  4-week average headers matching the web app for the same data.
- User can add/edit/delete entries (item and recipe), create/edit items, and
  create/edit recipes, with search and suggestions working.
- Nutrition targets persist on the server and drive the rings.
- Mandatory unit tests pass in CI; CI builds the app on PRs touching `ios/`.
- **Auth0 tenant + backend manual setup completed (§16 / §17 checklist).**

---

## 16. Appendix: Manual Auth0 Tenant Configuration

> ⚠️ **These steps are done by hand in the Auth0 dashboard — they are not code and
> cannot be created by the build.** Login will not work until they're complete.
> See the reminder checklist in §17.

The iOS app reuses the **existing Auth0 tenant** that backs the web app, but it
needs its **own Native application** registered (the web app is a SPA app; a Native
app is a separate, secret-less public client that uses PKCE).

### 16.1 Create the Native application
1. Auth0 Dashboard → **Applications → Applications → Create Application**.
2. Name: `Food Diary iOS`. Type: **Native**. Create.
3. From the **Settings** tab, copy the **Domain** and **Client ID** — these go
   into the app's `.xcconfig` (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`). A Native app
   has **no client secret** (correct — it's a public client).

### 16.2 Configure callback / logout URLs
Pick a custom URL scheme tied to the bundle id, e.g. bundle id
`com.bspaulding.fooddiary` → scheme `com.bspaulding.fooddiary`. The callback URL
format is `{SCHEME}://{AUTH0_DOMAIN}/ios/{BUNDLE_ID}/callback`.

In the Native app's **Settings**:
- **Allowed Callback URLs:**
  `com.bspaulding.fooddiary://<YOUR_AUTH0_DOMAIN>/ios/com.bspaulding.fooddiary/callback`
- **Allowed Logout URLs:** same value (used by the `/v2/logout` return).
- Save changes.

### 16.3 Enable refresh tokens with rotation
In the Native app's settings:
- **Settings → Refresh Token Rotation:** enable **Rotation**.
- **Refresh Token Expiration:** enable **Absolute** (and optionally
  **Inactivity/Idle**) expiration per your preference.
- Ensure **Grant Types** (Settings → Advanced → Grant Types) include
  **Authorization Code** and **Refresh Token**.
- The app must request the `offline_access` scope (handled in code, §6.5) for a
  refresh token to be issued.

### 16.4 Confirm the API (audience) authorizes the Native app
The access token must be a JWT for the Hasura API
(`https://direct-satyr-14.hasura.app/v1/graphql`):
- Auth0 Dashboard → **Applications → APIs** → the Hasura API → **Settings**:
  ensure **Allow Offline Access** is enabled (so refresh tokens are issued for
  this audience).
- No per-application authorization toggle is needed for SPA/Native against a
  standard API, but verify the audience identifier exactly matches the value the
  app sends.

### 16.5 Values that land in the app config
Populate `ios/FoodDiary/Config/*.xcconfig` (not committed with real values if you
prefer; the client id/domain are not secrets but keep the file out of source if
desired):

Only values **without** `://` go in `.xcconfig`:

```
AUTH0_DOMAIN     = <your-tenant>.us.auth0.com
AUTH0_CLIENT_ID  = <native app client id>
AUTH0_SCHEME     = com.bspaulding.fooddiary
```

> ⚠️ **xcconfig treats `//` as a comment**, so any value containing `://` (the
> audience URL `https://…` and the redirect URI) is silently truncated. Keep the
> **audience** and **redirect URI** in Swift instead, assembled from the config
> values above:
> - audience: `"https://direct-satyr-14.hasura.app/v1/graphql"` (a constant)
> - redirect: `"\(scheme)://\(domain)/ios/\(bundleId)/callback"`

Register the scheme in `Info.plist` under `CFBundleURLTypes` so the OS routes the
callback back to the app.

### 16.6 Quick verification
- Run the app, tap Log In → the Auth0 universal-login page appears in the
  in-app browser sheet → after login it returns to the app.
- Decode the returned `access_token` at jwt.io (or in a debug log of claims) and
  confirm it contains `https://hasura.io/jwt/claims` with `x-hasura-user-id`. If
  the token is opaque (not a JWT) the `audience` param is missing/wrong (§6.5).
- Confirm a GraphQL query returns the signed-in user's data.

---

## 17. ⏰ Reminder Checklist — manual setup (complete before first run / TestFlight)

> **Reminder for Brad:** the app cannot authenticate or persist targets until the
> following manual, out-of-band setup is done. None of this is created by building
> the Xcode project — schedule it as the final step before first run / TestFlight.

- [ ] **Auth0:** create the **Native** application in the existing tenant (§16.1).
- [ ] **Auth0:** set Allowed **Callback** and **Logout** URLs to the custom scheme
      (§16.2).
- [ ] **Auth0:** enable **Refresh Token Rotation** + ensure Authorization Code &
      Refresh Token grants (§16.3).
- [ ] **Auth0:** confirm the Hasura **API audience** allows offline access and the
      identifier matches (§16.4).
- [ ] **App config:** put Domain / Client ID / Audience / Scheme into `.xcconfig`
      and register `CFBundleURLTypes` in `Info.plist` (§16.5).
- [ ] **Verify:** complete a login round-trip and confirm the access token is a
      Hasura-claims JWT (§16.6).
- [ ] **Backend:** apply the `nutrition_target` migration + Hasura metadata
      permissions (§9), then `hasura migrate apply` / `hasura metadata apply`.
- [ ] **TestFlight:** App Store Connect app record, signing/provisioning, and
      upload the first build.
