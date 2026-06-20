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
| Phase 1 — Core logging (v1) | ◐ | — | GraphQL operations + protocol-backed repositories + DesignSystem (§10) + diary list (§4) + entry form (§5) + nutrition items (§6) + recipes (§7) landed; §8–§9 still open |
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
- [x] Repositories (protocol-backed) for diary/items/recipes/search/suggestions/targets — Note: SwiftUI features (§8–§9: targets, profile, error/session handling) remain open; diary list, entry form, items, recipes, and design system are now landed (see below).
- [x] `MacroCalculations` + `WeeklyStats` + `DateHelpers` ported and unit-tested (§3)
- [x] Diary list: rings, grouping, 7-day/4-week headers, paging, empty state (§4) — `DiaryGrouping`/`DiaryListViewModel` unit-tested (load, paging, optimistic delete + rollback); `DiaryListView` wired into `RootView`/`AppEnvironment`. Edit/Delete/Add buttons push `Route`s whose destination screens (§5–§7) are still placeholders.
- [x] Add/edit/delete entry with search + 3 suggestion sources (§5); delete optimistic + rollback — `SuggestionHourRange`/`NewEntryViewModel`/`EditEntryViewModel` unit-tested (suggestion loading, search, save item/recipe, edit load/save/delete, error states); `NewEntryView`/`EditEntryView` are thin SwiftUI wrappers wired into `RootView`'s `.newEntry`/`.editEntry` destinations
- [x] Nutrition items: create/view/edit (§6) — `ItemFormViewModel` (create + edit, full macro set, save error handling) and `ItemDetailViewModel` (load/error states) unit-tested with actor-based fake `NutritionItemRepository`; `ItemFormView`/`ItemDetailView` are thin SwiftUI wrappers wired into `RootView`'s `.newItem`/`.itemEdit`/`.itemDetail` destinations. Camera-scan/LLM-autofill deferred to Phase 3 per plan.
- [x] Recipes: create/view/edit (delete-then-insert items) (§7) — `RecipeFormViewModel` (create + edit via optional `recipeID`, search-as-you-type item picker over `SearchRepository.searchItems`, add/remove/edit-servings on the item list, save error handling) and `RecipeDetailViewModel` (load/error states, total-calories and calories-per-serving computed properties ported from `web/src/RecipeShow.tsx`) unit-tested with actor-based fake `RecipeRepository`/`SearchRepository`; `RecipeFormView`/`RecipeDetailView` are thin SwiftUI wrappers wired into `RootView`'s `.newRecipe`/`.recipeEdit`/`.recipeDetail` destinations; `AppEnvironment.recipeRepository` added. Update replaces all recipe items via the existing delete-then-insert `RecipeRepositoryImpl.update`.
- [ ] Nutrition targets: view/edit, server-stored, drive rings (§8)
- [ ] Profile: user info, targets link, debug env switcher, logout (§9)
- [x] DesignSystem: `MacroRing` (exact color rules), `DateBadge`, `Theme` (§10) — ratio/color logic in `MacroRingMath` and date formatting in `DateBadgeFormatting`, each unit-tested; views are thin wrappers
- [ ] Error/session handling: 401/403 → re-login; per-screen loading/error (§11)

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
