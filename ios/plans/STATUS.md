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
| Phase 2 — Insights (Trends) | ☐ | — | deferred from v1 |
| Phase 3 — Native capture (scan + LLM) | ☐ | — | deferred from v1 |
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

- [ ] `GetWeeklyTrends` + `TrendsRepository` (+ decode test)
- [ ] Trends screen (Swift Charts): calories/protein/added-sugar series
- [ ] "View Trends" link un-hidden from the diary header

## Phase 3 — Native capture ([plan](phase-3-native-capture.md))

- [ ] Precondition: sidecar ingress accepts the Bearer JWT (§0)
- [ ] `/llm/lookup` autofill on item form (+ decode/error/mapping tests)
- [ ] `/labeller/upload` camera scan autofill (+ permissions)

## Phase 4 — Data portability ([plan](phase-4-data-portability.md))

- [ ] Export/import GraphQL ops added
- [ ] CSV serialize/parse ported, round-trip vs. web fixtures (tested)
- [ ] Export via share sheet/Files; import via Files picker with preview

## Phase 5+ — Platform polish ([plan](phase-5-platform-polish.md))

- [ ] iPad adaptive layouts
- [ ] SwiftData read cache
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
