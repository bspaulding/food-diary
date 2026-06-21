# Food Diary iOS — Implementation Status

Living status of the work described in the PRD (`specs/2026-06-20-ios-app.md`) and
the plans in this folder. **Update this file as part of the same PR that completes
an item** (check the box, add the PR # and date). It is the single source of truth
for "what's done"; the plans describe *how*, this tracks *whether*.

**Legend:** ☐ not started · ◐ in progress · ☑ done

**Last updated:** 2026-06-20

---

## Phase status overview

| Phase / plan | Status | PR(s) | Notes |
|---|---|---|---|
| Phase 0 — Foundation | ◐ | — | project, models, auth, networking, login gate landed; pending live-tenant verification |
| ↳ Testing + CI infra (first PR) | ☑ | — | walking-skeleton test + auth/error/decoding tests; `test-ios` job added to `ci-cd.yml` |
| Backend — nutrition targets (§9) | ☑ | — | migration + metadata written and verified locally; needs apply against the real dev/prod Hasura instance |
| Auth0 + TestFlight manual setup (§16/§17) | ☐ | — | out-of-band; see checklist below |
| Phase 1 — Core logging (v1) | ☑ | — | GraphQL operations + protocol-backed repositories + DesignSystem (§10) + diary list (§4) + entry form (§5) + nutrition items (§6) + recipes (§7) + nutrition targets (§8) + profile (§9) + error/session handling (§11) all landed |
| Phase 2 — Insights (Trends) | ☑ | — | `GetWeeklyTrends` + `TrendsRepository` + `TrendsViewModel`/`TrendsView` (Swift Charts) landed |
| Phase 3 — Native capture (scan + LLM) | ◐ | — | networking/decoding/error-mapping/retry, ViewModel actions, camera capture UI, and item-form wiring all built + unit-tested; §0 ingress-JWT precondition is UNVERIFIED (no live deployment reachable from this sandbox) |
| Phase 4 — Data portability (CSV) | ☐ | — | deferred from v1 |
| Phase 5+ — Platform polish | ☐ | — | iPad, cache, widgets, HealthKit, App Store |

---

## Phase 0 — Foundation ([plan](phase-0-foundation.md))

- [x] Xcode project under `ios/` created (`FoodDiary.xcodeproj`, validated with the `xcodeproj` gem; not yet built on a macOS/Xcode 16 runner)
- [x] `FoodDiaryTests` target + walking-skeleton test (§1.2)
- [x] `test-ios` CI job added to `.github/workflows/ci-cd.yml`, gated on `ios/**` (§1.2, [ci.md](ci.md)) — not yet observed green (needs a macOS runner run)
- [x] Config (`.xcconfig` + `Info.plist` `CFBundleURLTypes`) wired (§1.1) — placeholder Auth0 domain/client id, see [auth0-testflight-setup.md](auth0-testflight-setup.md)
- [x] Models decode (golden JSON, snake_case, item/recipe XOR) (§2)
- [x] PKCE + OIDCClient + Keychain + TokenStore (refresh coalescing) (§3)
- [x] GraphQLClient + APIError mapping (§4)
- [x] DI container + login gate + NavigationStack route enum (§5/§6)
- [x] Phase 0 unit tests written (PKCE vectors, exp decode, coalescing, errors) — not yet run in CI (needs macOS runner)

## Backend — Nutrition targets ([plan](backend-nutrition-targets.md))

- [x] Migration up/down applies cleanly (verified against a local ephemeral Hasura/Postgres stack)
- [x] Table tracked + `user` role permissions + `on_conflict` upsert work (RLS-scoped) — verified two distinct synthetic JWTs cannot see each other's row
- [x] `GetNutritionTargets` / `SetNutritionTargets` verified against a real (synthetic HS256) JWT — still needs to be applied to the actual dev/prod Hasura instance (tracked in the §16/§17 checklist below)

## Auth0 + TestFlight manual setup ([runbook](auth0-testflight-setup.md), PRD §17)

> ⚠️ Out-of-band — none of this is created by building the project.

- [ ] Auth0: Native application created in the existing tenant (§16.1)
- [ ] Auth0: Allowed Callback + Logout URLs set to the custom scheme (§16.2)
- [ ] Auth0: Refresh Token Rotation + Authorization Code & Refresh Token grants (§16.3)
- [ ] Auth0: Hasura API audience allows offline access + identifier matches (§16.4)
- [ ] App config: Domain/Client ID/Scheme in `.xcconfig`; audience+redirect in Swift; `Info.plist` scheme (§16.5)
- [ ] Verify: login round-trip returns a Hasura-claims JWT (§16.6)
- [ ] Backend: `nutrition_target` migration + metadata applied (§9)
- [ ] TestFlight: App Store Connect record, signing/provisioning, first upload

## Phase 1 — Core logging / v1 ([plan](phase-1-core-logging.md))

- [x] GraphQL operations mirrored from `web/src/Api.ts` (§1) — each with golden decode test
- [x] Repositories (protocol-backed) for diary/items/recipes/search/suggestions/targets — diary list, entry form, items, recipes, design system, nutrition targets, profile, and error/session handling are all landed (see below).
- [x] `MacroCalculations` + `WeeklyStats` + `DateHelpers` ported and unit-tested (§3)
- [x] Diary list: rings, grouping, 7-day/4-week headers, paging, empty state (§4) — `DiaryGrouping`/`DiaryListViewModel` unit-tested (load, paging, optimistic delete + rollback); `DiaryListView` wired into `RootView`/`AppEnvironment`. Edit/Delete/Add buttons push `Route`s whose destination screens (§5–§7) are still placeholders.
- [x] Add/edit/delete entry with search + 3 suggestion sources (§5); delete optimistic + rollback — `SuggestionHourRange`/`NewEntryViewModel`/`EditEntryViewModel` unit-tested (suggestion loading, search, save item/recipe, edit load/save/delete, error states); `NewEntryView`/`EditEntryView` are thin SwiftUI wrappers wired into `RootView`'s `.newEntry`/`.editEntry` destinations
- [x] Nutrition items: create/view/edit (§6) — `ItemFormViewModel` (create + edit, full macro set, save error handling) and `ItemDetailViewModel` (load/error states) unit-tested with actor-based fake `NutritionItemRepository`; `ItemFormView`/`ItemDetailView` are thin SwiftUI wrappers wired into `RootView`'s `.newItem`/`.itemEdit`/`.itemDetail` destinations. Camera-scan/LLM-autofill deferred to Phase 3 per plan.
- [x] Recipes: create/view/edit (delete-then-insert items) (§7) — `RecipeFormViewModel` (create + edit via optional `recipeID`, search-as-you-type item picker over `SearchRepository.searchItems`, add/remove/edit-servings on the item list, save error handling) and `RecipeDetailViewModel` (load/error states, total-calories and calories-per-serving computed properties ported from `web/src/RecipeShow.tsx`) unit-tested with actor-based fake `RecipeRepository`/`SearchRepository`; `RecipeFormView`/`RecipeDetailView` are thin SwiftUI wrappers wired into `RootView`'s `.newRecipe`/`.recipeEdit`/`.recipeDetail` destinations; `AppEnvironment.recipeRepository` added. Update replaces all recipe items via the existing delete-then-insert `RecipeRepositoryImpl.update`.
- [x] Nutrition targets: view/edit, server-stored, drive rings (§8) — `TargetsViewModel` (load with default fallback, save, error states) unit-tested with an actor-based fake `TargetsRepository`; `TargetsView` is a thin SwiftUI wrapper wired into `RootView`'s new `.targets` destination, reached via a "Targets" toolbar button on `DiaryListView` (Profile/§9 isn't built yet, so this is the temporary entry point — it should move to a "Edit nutrition targets" link once Profile lands). No additional in-memory cache was added: `TargetsRepositoryImpl.targets()` already returns `NutritionTargets.default` when no server row exists, and `DiaryListViewModel.load()` already re-fetches `targetsRepository.targets()` on every load, so a save naturally drives ring updates on return to the diary list via the normal repository round-trip.
- [x] Profile: user info, targets link, debug env switcher, logout (§9) — `ProfileViewModel` unit-tested (user fields from `AuthenticatedUser`/id_token claims, `isUsingCustomBackend`/`setCustomBackend`/`resetToProductionBackend` against `AppEnvironmentConfig`); `JWT.profileClaims(of:)` decodes name/email/picture from the id_token (no `userinfo` round-trip needed for v1) and `AuthService.userInfo(from:)` now populates `AuthenticatedUser` from it — both unit-tested in `JWTTests`. `ProfileView` is a thin SwiftUI wrapper (picture/name/email, "Edit Nutrition Targets" link, `#if DEBUG` Developer section with LAN host/port fields + reset-to-production, "Log Out" calling `AuthService.logout()`) wired into `RootView`'s new `.profile` destination. `DiaryListView`'s temporary "Targets" toolbar button was replaced with "Profile" (entry point now Diary → Profile → Edit Nutrition Targets, per the plan). Known gap: `AppEnvironmentConfig.backend` toggling does not yet rebuild `GraphQLClient`'s `baseURL` at runtime (it's captured once in `AppEnvironment.init()`) — the Developer switcher control and its state are wired and tested, but actually re-pointing network calls at a LAN host without an app relaunch is a follow-up.
- [x] DesignSystem: `MacroRing` (exact color rules), `DateBadge`, `Theme` (§10) — ratio/color logic in `MacroRingMath` and date formatting in `DateBadgeFormatting`, each unit-tested; views are thin wrappers
- [x] Error/session handling: 401/403 → re-login; per-screen loading/error (§11) — 401/403→sign-out→login-gate was already wired in Phase 0 (`GraphQLClient.execute` calls `tokenProvider.signOut()` on `APIError.unauthorized`; `RootView` already routes `.signedOut`/`.signingIn` to `LoginView`), confirmed still correct, no new code needed there. Added a shared `ErrorRetryView` (DesignSystem) — message + "Retry" button re-running the screen's `load()` — and adopted it in place of bare `Text(message)` on `ItemDetailView`, `ItemFormView`, `RecipeDetailView`, `RecipeFormView`, `TargetsView`, `EditEntryView`. `DiaryListView` previously never switched on `DiaryListViewModel.state` at all (always rendered the list); it now shows `ProgressView`/`ErrorRetryView`/list for `.loading`/`.error`/`.idle`+`.loaded`. `NewEntryView` intentionally keeps `loadSuggestions()`/`search()` silently falling back to empty results (suggestions/search are best-effort, not blocking) but now surfaces `NewEntryViewModel.saveError` inline under the expanded row's Save button (with `saveError` reset at the start of each `save()` call) instead of dropping it, and only collapses/calls `onSave()` after a confirmed `didSave`. Full suite (134/134) and full `xcodebuild build` both green after the change.

## Phase 2 — Insights / Trends ([plan](phase-2-insights.md))

- [x] `GetWeeklyTrends` (`Api.Trends.getWeeklyTrends`) + `WeeklyTrendsData` model + `TrendsRepository`/`TrendsRepositoryImpl` (`Repositories.swift`) — golden-JSON decode tests in `TrendsApiTests` cover both string and integer JSON encodings of `week_of_year` (the underlying Postgres view column is `int`; the web type treats it as `string`, so `WeeklyTrendsData`'s custom `init(from:)` accepts either and normalizes to `String`), plus an empty-array case.
- [x] `TrendsViewModel` (`@Observable @MainActor`, `loading/loaded/error` state mirroring `ItemDetailViewModel`'s pattern) loads `TrendsRepository.weeklyTrends()` + `TargetsRepository.targets()` on `.task`, client-side sorting trends ascending by `Int(weekOfYear)` (the Hasura view has no natural order) — unit-tested in `TrendsViewModelTests` with actor-based fake repositories (sort order, targets population, error state, empty state).
- [x] `TrendsView` (thin SwiftUI wrapper, untested per the established pattern for views): one `Chart` per metric (Calories/Protein/Added Sugar) using `LineMark`+`PointMark` over `week_of_year`, with a dashed `RuleMark` reference line at the corresponding `NutritionTargets` value (calories/proteinGrams/addedSugarsGrams). Empty-data state matches web's "No data available yet" message.
- [x] "View Trends" link added: `DiaryListView` toolbar gained a "Trends" button (no pre-existing hidden link was found in the codebase to un-hide, so a new toolbar button was added per the plan's fallback instruction) pushing `Route.trends`; wired into `Router`, `AppEnvironment.trendsRepository`, and `RootView.destination(for:)` following the exact pattern of `.targets`/`.profile`.

## Phase 3 — Native capture ([plan](phase-3-native-capture.md))

- [ ] **BLOCKED/UNVERIFIED** — Precondition: sidecar ingress accepts the Bearer JWT (§0). There is no reachable live deployment/ingress config in this sandbox to test against (no `*ingress*` files found in the repo outside `.worktrees`). The native client is implemented to send `Authorization: Bearer <token>` on both `/llm/lookup` and `/labeller/upload` per the plan's explicit instruction, but whether the real ingress actually authorizes these routes with the Hasura JWT has **not** been confirmed against live infra. A human with access to the actual sidecar/ingress deployment needs to verify this before shipping; if it turns out the ingress rejects the token, the fix is purely infra-side (this client code does not need to change).
- [x] `/llm/lookup` autofill on item form (+ decode/error/mapping tests) — `SidecarClient.lookupNutrition(description:)` (`FoodDiary/Networking/SidecarClient.swift`) ports the exact field-by-field coercion from `lookupNutritionWithLLM` (`web/src/Api.ts:894-953`): every macro field decodes via a `[String: Any]` dictionary lookup defaulting to `0` if missing/non-numeric (mirrors JS `typeof x === "number"`), `description` defaults to `""`. Non-2xx: tries to decode `{"error": String}` from the body, falls back to an `HTTP <code> <localized status>` message (`SidecarError`). `ItemFormViewModel.lookUp()` calls it via the new `lookupQuery`/`lookupState` (`idle`/`loading`/`error`) and applies the result into the existing macro fields, leaving Save unchanged. 11 `SidecarClientTests` (decode success/defaults, request body shape, Authorization header, error-body-vs-statusText fallback) + 4 `ItemFormViewModelTests` (prefill, empty-query no-op, failure leaves fields untouched) using a `FakeAutofillClient` actor (`NutritionAutofillClient` protocol lets the ViewModel be tested without real networking) and a `MockURLProtocol`-backed `URLSession` for `SidecarClient` itself (new pattern in this codebase — `GraphQLClient` tests use repository fakes instead, since GraphQL request-shape correctness wasn't separately under test there).
- [x] `/labeller/upload` camera scan autofill (+ permissions) — `SidecarClient.uploadLabel(imageData:)` builds a `multipart/form-data` body (`image` field, `capture.jpg`) with the Bearer header, retries up to 3 times on any throw (network error or non-2xx) mirroring web's `retry` helper (`web/src/CameraModal.tsx:244-267`), and maps the **abbreviated** response field names (`total_fat_grams`, `cholesterol_mg`, `sodium_mg`, `total_carbohydrates_g`, `dietary_fiber_g`, `total_sugars_g`, `added_sugars_g`, `protein_g` — deliberately different from the LLM response's full `_grams`/`_milligrams` names) ported from `CameraModal.uploadImage`'s `getNumericValue` calls (`web/src/CameraModal.tsx:285-301`); non-2xx throws `Upload failed: <statusText> (<code>)`. Camera capture is `AVFoundation`-based still-image capture (`FoodDiary/Features/Items/CameraCaptureView.swift`: `CameraCaptureController` + `CameraPreviewView` + `CameraCaptureView` sheet) — simple capture-and-upload per the plan ("start simple"), no on-device Vision OCR pre-pass. `NSCameraUsageDescription` added to `Info.plist`. `ItemFormViewModel.scanLabel(imageData:)` + `scanState` wired the same way as lookup. Tests: retry-success-on-3rd-attempt, retry-exhaustion-throws, multipart body shape, missing-fields-default-to-zero, plus the corresponding `ItemFormViewModelTests` prefill/failure cases. `CameraCaptureView`/`CameraPreviewView` themselves are thin UIKit-bridging views, untested per the established pattern for views.
- [x] Item form integration — `ItemFormView` gained an "Autofill" section: a text field + "Look Up" button (disabled while loading or empty), and a "Scan Label" button opening `CameraCaptureView` as a sheet; both show inline `ProgressView`/red error text without replacing the whole form (autofill failures don't block manual entry/Save). `AppEnvironment.sidecarClient` added and wired into `RootView`'s `.newItem`/`.itemEdit` destinations via `ItemFormViewModel(itemID:itemRepository:autofillClient:)`.

## Phase 4 — Data portability ([plan](phase-4-data-portability.md))

- [x] Export/import GraphQL ops added — `Api.Export`/`Api.Import` operations (entries-for-export query, insert-entries mutation) in `Api.swift`, with golden decode/encode coverage in `ExportImportApiTests`; `ExportRepository`/`ExportRepositoryImpl` and `ImportRepository`/`ImportRepositoryImpl` added to `Repositories.swift` (untested at the repository layer, matching the established codebase convention that no `*RepositoryImpl` has dedicated tests — `GraphQLClient` is a non-subclassable `struct`, so coverage comes from the Api.swift tests + ViewModel-level fake-repository tests instead).
- [x] CSV serialize/parse ported, round-trip vs. web fixtures (tested) — `FoodDiary/Util/CSV.swift` ports `web/src/CSVExport.ts`/`CSVImport.ts` byte-for-byte (18-column header, recipe-entry expansion into one row per recipe item, quoting/escaping, integer-vs-decimal number formatting, Date/Time/Consumed-At formatting against the passed `Calendar`'s timezone); `CSVTests` (14 tests) verify exact output/parsing including round-trip.
- [x] Export via Files (`.fileExporter`)/import via Files picker with preview — `ExportViewModel`/`ImportViewModel` (`@MainActor @Observable`, unit-tested with actor-based fake repositories in `ExportViewModelTests`/`ImportViewModelTests`) and thin SwiftUI wrappers `ExportView`/`ImportView` (date-range toggle + `.fileExporter` with a custom `CSVDocument: FileDocument`; `.fileImporter` → preview list of parsed rows + per-row parse errors → confirm to insert). Reached via a new "Data" section on `ProfileView` ("Export Entries"/"Import Entries" buttons) and `Route.exportEntries`/`.importEntries` wired into `Router`/`AppEnvironment`/`RootView`. Full build + full test suite (179/179 across 36 suites) green after wiring.

## Phase 5+ — Platform polish ([plan](phase-5-platform-polish.md))

- [ ] iPad adaptive layouts
- [x] SwiftData read cache — `FoodDiary/Repositories/CacheModels.swift` adds six `@Model` entities (`CachedDiaryEntriesPage` keyed by `(from, to)` ISO window, `CachedDiaryEntry` keyed by id, `CachedWeeklyStats` keyed by the three anchor dates, `CachedNutritionItem`/`CachedRecipe` keyed by id, singleton `CachedNutritionTargets`), each storing the JSON-encoded model (`JSONCoding.encoder`/`.decoder`) plus `fetchedAt` rather than mirroring fields into SwiftData relationships — keeps the cache schema trivial to maintain against `Models/*.swift`. `CacheSchema.makeContainer(inMemory:)` builds the shared `ModelContainer`. `FoodDiary/Repositories/CachingRepositories.swift` adds `CachingDiaryRepository`/`CachingNutritionItemRepository`/`CachingRecipeRepository`/`CachingTargetsRepository`, each wrapping an inner `*Repository` of the same protocol plus a `ModelContext`: reads attempt the network first and reconcile the cache on success, falling back silently to the cache (no error surfaced) only when the network call throws and a cached entry exists, otherwise rethrowing; writes (create/update/delete) delegate to the inner repository then invalidate/remove the affected cache entries so the next read refetches instead of showing stale data. `AppEnvironment.init()` now builds one `cacheContainer`/`ModelContext` and substitutes the four caching decorators in place of the bare `*RepositoryImpl` for diary/items/recipes/targets (view models unchanged — same protocol seam); `SearchRepository`/`SuggestionsRepository`/`TrendsRepository`/`ExportRepository`/`ImportRepository` left untouched per the plan. 19 new tests in `CachingRepositoriesTests.swift` (cache-then-reconcile, fall-back-to-cache-on-network-error, throws-when-no-cache-and-network-fails, separate cache keys per query window, write invalidation) using the existing actor-fake-repository pattern against an in-memory `ModelContainer`. Full build + full test suite (198/198 across 40 suites) green after wiring.
- [ ] Widgets / Shortcuts
- [ ] HealthKit
- [ ] App Store readiness (privacy labels, account deletion, public release)

---

## v1 Definition of Done (PRD §15)

v1 ships when **all** of these hold:

- [ ] Signed TestFlight build installs and runs on iOS 18+ iPhone
- [ ] Login/logout via Auth0; session survives relaunch
- [ ] Diary list: correct per-day rings + 7-day/4-week headers, matching web for same data
- [ ] Add/edit/delete entries (item & recipe), create/edit items, create/edit recipes, with search + suggestions
- [ ] Nutrition targets persist on the server and drive the rings
- [ ] Mandatory unit tests pass in CI; CI builds the app on `ios/` PRs
- [ ] Auth0 tenant + backend manual setup complete (§16/§17 checklist above)
</content>
