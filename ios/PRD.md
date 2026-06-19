# Food Diary — iOS App PRD

**Status:** Draft for implementation
**Author:** Brad Spaulding
**Last updated:** 2026-06-19
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
| 6 | Authentication | **Auth0.swift SDK** | Native login, token refresh, Keychain storage; reuses existing tenant. |
| 7 | Persistence / offline | **Online-only** | Fetch on demand, no local store (matches current web behavior). |
| 8 | Nutrition targets storage | **Store on server** | New additive Hasura table keyed by `user_id` (see §9). |
| 9 | Repo location | **`ios/` in this monorepo** | Alongside `web/`, `graphql-engine/`, etc. |
| 10 | Project tooling | **Plain Xcode project** | `.xcodeproj` committed, deps via SPM. |
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
│  Auth0.swift ────┼────────┼─▶│ /api/v1/graphql (JWT, per-user RLS) │
│                  │  Bearer │  └──────────────┘                      │
│  URLSession ─────┼────────┼─▶ /labeller/upload  (Rust OCR)  [later] │
│                  │  JWT    │  └─▶ /llm/lookup     (Rust LLM)  [later]│
│  Auth0 tenant ◀──┼────────┼─▶ Auth0 (OIDC, Hasura JWT claims)      │
└─────────────────┘         └──────────────────────────────────────┘
```

- **Auth:** Auth0 OIDC. Audience `https://direct-satyr-14.hasura.app/v1/graphql`.
  Access token is a JWT containing Hasura claims (`x-hasura-user-id`,
  `x-hasura-default-role: user`, allowed roles). The same token authorizes
  Hasura, the labeller, and the LLM service via the ingress.
- **Data scoping:** Every table has a `user_id text NOT NULL` column. Hasura
  `user` role permissions filter all reads/writes by
  `user_id _eq X-Hasura-User-Id` and auto-set `user_id` on insert. The iOS app
  never sends `user_id` — it is derived from the JWT server-side, exactly like
  the web app.

---

## 4. Feature Scope — v1 (Core Logging)

### 4.1 Authentication & session
- Log in via Auth0 (native browser flow through Auth0.swift).
- Persist session across launches (Keychain via the SDK); silent token refresh.
- Log out (clears session, returns to login screen).
- On any `401/403` from the API, treat the session as invalid and route to login
  (mirrors the web app's `AuthorizationError` → logout behavior).

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
                    └─ gets token from → AuthService (Auth0.swift)
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
- **AuthService** wraps Auth0.swift: `login()`, `logout()`, `currentToken()`
  (with refresh), and publishes auth state to the app root.

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
      AuthService.swift           # Auth0.swift wrapper (@Observable)
      AuthState.swift
    Networking/
      GraphQLClient.swift
      APIError.swift
      Endpoints.swift             # query/mutation strings
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
- **Auth0 config** (`domain`, `clientId`, `audience`) supplied via an
  `.xcconfig` / `Info.plist` keys, not hard-coded in source. Audience matches the
  web app. A native Auth0 **Application** (type: Native) must be created/configured
  in the Auth0 tenant with the iOS bundle ID callback URL
  (`{BUNDLE_ID}://{AUTH0_DOMAIN}/ios/{BUNDLE_ID}/callback`).
- **Secrets:** no API keys ship in the app; the Auth0 client ID for a Native app
  is public by design. The labeller/LLM services authorize via the user's JWT.

---

## 11. Roadmap / Phasing

| Phase | Theme | Contents |
|---|---|---|
| **0** | Foundation | Xcode project, SPM deps (Auth0), CI, `GraphQLClient`, `AuthService`, models, DI, login gate, base navigation. |
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
- **Manual test plan:** login/logout, log an item entry, log a recipe entry,
  edit servings/time, delete with rollback, create item, create recipe, change
  targets and confirm rings update, week paging, expired-token → re-login.
- **CI (decision #14):** GitHub Actions workflow (`.github/workflows`) that builds
  the app and runs the unit test bundle on PRs touching `ios/`, using
  `xcodebuild`/`xcrun simctl` on a `macos` runner with an iOS 18 simulator.
  `TZ=America/Los_Angeles` set for date-sensitive tests (matches `web/`).

---

## 13. Dependencies

- **Auth0.swift** (SPM) — auth + Keychain token storage. (Only third-party dep.)
- Everything else uses the system SDK: SwiftUI, `URLSession`, `Codable`,
  Swift Charts (phase 2), VisionKit/AVFoundation (phase 3).

---

## 14. Risks & Open Questions

| Risk / question | Impact | Mitigation / proposal |
|---|---|---|
| Auth0 Native app + callback URL not yet configured | Blocks login | Create a Native Auth0 application in the tenant during Phase 0; reuse existing audience. |
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
</content>
</invoke>
