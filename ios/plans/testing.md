# Testing & Quality

**PRD coverage:** §6.5 (auth tests), §12 (mandatory v1 coverage, manual test
plan, CI), decision #13 (minimal scope).

**Framework:** Swift Testing (Xcode 16+, iOS 18). Target `FoodDiaryTests`.
**Scope is deliberately minimal** (decision #13): unit-test the critical
calculations, API decoding, error mapping, and the auth crypto/refresh logic —
not the UI.

> **Sequencing:** this infrastructure is stood up **first**, during scaffolding
> (Phase 0 §1.2), not after features exist. The test target and CI run against a
> trivial walking-skeleton test before any auth/model/networking code, so every
> later unit is added **test-first** against a pipeline that is already green.

---

## 0. Set up first (Phase 0 §1.2)

Before writing feature code:
1. Create the `FoodDiaryTests` Swift Testing target wired to the `FoodDiary`
   scheme (`xcodebuild test` runs it).
2. Add one trivial walking-skeleton `@Test` so the bundle is runnable and proves
   the simulator destination works.
3. Stand up the `test-ios` CI job ([`ci.md`](ci.md)) and require it green on the
   first `ios/` PR — this establishes the standard for the project.
4. Lock the conventions used everywhere after: Swift Testing `@Test`/`#expect`;
   protocol-backed repositories + token endpoint for fakes; pure logic tested, UI
   not; `TZ=America/Los_Angeles` for date-sensitive tests.

Thereafter, each item in §1 lands in the **same change** as the code it covers.

---

## 1. Mandatory unit coverage (§12)

### 1.1 `MacroCalculations` (Phase 1, §7.1)
Port the web app's calculation fixtures for **parity**:
- `recipeTotal` — sum(servings × macro) / max(totalServings, 1); incl.
  `totalServings = 0` → divide by 1.
- `entryTotal` — servings × (itemMacro + recipeTotal); item-only, recipe-only.
- `dayTotal` — sum across a day's entries.
- Per-day calories ring = `ceil(sum(entry.calories))`; per-entry display rounding
  = `round(...)` (match `web/src/DiaryList.tsx`).

### 1.2 `WeeklyStats` (Phase 1)
- `calculateDaysBetween` (min 1, floor of day diff).
- `calculateDailyAverage` = `ceil(total / days)`; `total = 0` and `null→0` cases.
- `calculateFourWeeksDays(now)` with fixed `now` values.
- **Run with `TZ=America/Los_Angeles`** (date-sensitive, matches web).

### 1.3 `GraphQLClient` decoding
Golden JSON → model for **every** v1 operation (Phase 1 §1):
- `GetEntries` (item entry, recipe entry, mixed day), `GetWeeklyStats`
  (incl. `sum.calories = null`), search, suggestions, `GetNutritionItem`,
  `GetRecipe`, `GetDiaryEntry`, `GetNutritionTargets`.
- Assert **snake_case → camelCase** mapping and the **item/recipe XOR** on
  `DiaryEntry`.
- Assert input encoding (camelCase → snake_case) for `CreateNutritionItem`,
  `UpdateItem`, recipe create/update inputs, and the targets upsert object.

### 1.4 Error mapping
- HTTP 401 and 403 → `APIError.unauthorized` (and triggers logout hook).
- Non-empty GraphQL `errors` → `APIError.graphQL`.
- Other non-2xx / `URLError` → `APIError.transport`.

### 1.5 Auth (§6.5) — Phase 0
- **PKCE:** `code_challenge = base64url(SHA256(verifier))` vs. **RFC 7636 known
  vectors**.
- **Authorize URL:** all params present and correctly percent-encoded
  (`response_type`, `client_id`, `redirect_uri`, `scope` incl. `offline_access`,
  `audience`, `code_challenge`, `code_challenge_method=S256`, `state`).
- **JWT `exp` decoding:** base64url-decode payload, read `exp`; malformed token
  falls back to `expires_in`.
- **Refresh coalescing:** N concurrent `currentToken()` callers while expired ⇒
  **exactly 1** token request (inject a counting fake token endpoint). This is the
  marquee auth test.

---

## 2. Test doubles

Repositories and the token endpoint are protocol-backed (PRD §6.1), so tests
inject in-memory fakes. `GraphQLClient` decoding tests feed fixture `Data`
directly to the decoder rather than hitting the network.

---

## 3. Manual test plan (§12, run before each TestFlight build)

login/logout · log an item entry · log a recipe entry · edit servings/time ·
delete with rollback · create item · create recipe · change targets and confirm
rings update · week paging (prev/next, boundaries) · expired-token → re-login.

---

## 4. CI

See [`ci.md`](ci.md). CI builds the app and runs this test bundle on PRs touching
`ios/`, on a macOS runner with an iOS 18 simulator, `TZ=America/Los_Angeles` set.
</content>
