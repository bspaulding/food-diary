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
| Backend — nutrition targets (§9) | ☐ | — | migration + metadata applied |
| Auth0 + TestFlight manual setup (§16/§17) | ☐ | — | out-of-band; see checklist below |
| Phase 1 — Core logging (v1) | ☐ | — | diary/entries/items/recipes/targets/profile |
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

- [ ] Migration up/down applies cleanly
- [ ] Table tracked + `user` role permissions + `on_conflict` upsert work (RLS-scoped)
- [ ] `GetNutritionTargets` / `SetNutritionTargets` verified against a real JWT

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

- [ ] GraphQL operations mirrored from `web/src/Api.ts` (§1) — each with golden decode test
- [ ] Repositories (protocol-backed) for diary/items/recipes/search/suggestions/targets
- [ ] `MacroCalculations` + `WeeklyStats` + `DateHelpers` ported and unit-tested (§3)
- [ ] Diary list: rings, grouping, 7-day/4-week headers, paging, empty state (§4)
- [ ] Add/edit/delete entry with search + 3 suggestion sources (§5); delete optimistic + rollback
- [ ] Nutrition items: create/view/edit (§6)
- [ ] Recipes: create/view/edit (delete-then-insert items) (§7)
- [ ] Nutrition targets: view/edit, server-stored, drive rings (§8)
- [ ] Profile: user info, targets link, debug env switcher, logout (§9)
- [ ] DesignSystem: `MacroRing` (exact color rules), `DateBadge`, `Theme` (§10)
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
