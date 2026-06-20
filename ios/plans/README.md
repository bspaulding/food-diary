# Food Diary iOS — Implementation Plans

These plans turn the PRD (`specs/2026-06-20-ios-app.md`) into concrete,
sequenced engineering work. Each plan is self-contained: objective,
prerequisites, file-by-file breakdown, key implementation details ported from
the existing web app, tests, and a definition of done. Together they cover the
**entirety** of the PRD — every section, decision, phase, and the manual
out-of-band setup.

> **Tracking progress:** [`STATUS.md`](STATUS.md) is the living checklist of what's
> done across all phases (plus the §15 Definition of Done and §17 manual setup).
> Update it in the same PR that completes an item.

## How the plans map to the PRD

| Plan | PRD coverage | Ships in |
|---|---|---|
| [`phase-0-foundation.md`](phase-0-foundation.md) | §2, §3, §6 (architecture, OIDC client, GraphQL client, DI, navigation, login gate), §7 models, §10 config, §13 deps | Phase 0 |
| [`backend-nutrition-targets.md`](backend-nutrition-targets.md) | §9 (the only backend change for v1) | Phase 0/1 |
| [`auth0-testflight-setup.md`](auth0-testflight-setup.md) | §16 + §17 (manual Auth0 tenant + TestFlight runbook) | Phase 0 → first run |
| [`phase-1-core-logging.md`](phase-1-core-logging.md) | §4 (diary list, entries, items, recipes, search, suggestions, targets, profile), §7.1 calcs, §8 contract | Phase 1 (v1) |
| [`ci.md`](ci.md) | §12 CI + decision #14 | **Phase 0 (first PR)**, maintained throughout |
| [`testing.md`](testing.md) | §12 mandatory unit tests + §6.5 auth tests | **Phase 0 (set up first)**, grown throughout |
| [`phase-2-insights.md`](phase-2-insights.md) | §11 Phase 2 (Trends / Swift Charts) | Phase 2 |
| [`phase-3-native-capture.md`](phase-3-native-capture.md) | §11 Phase 3 (label scan + LLM autofill) | Phase 3 |
| [`phase-4-data-portability.md`](phase-4-data-portability.md) | §11 Phase 4 (CSV import/export) | Phase 4 |
| [`phase-5-platform-polish.md`](phase-5-platform-polish.md) | §11 Phase 5 (iPad, cache, widgets, HealthKit, App Store) | Phase 5+ |

## Locked decisions (from PRD §2) that constrain every plan

- iOS **18+**, Swift + SwiftUI, **MVVM + `@Observable`**, `@MainActor` view models.
- GraphQL over **URLSession + Codable**, hand-written query strings mirroring
  `web/src/Api.ts` — **no codegen, zero third-party dependencies** in v1.
- Auth is a **hand-rolled OIDC** Authorization Code + PKCE client on
  `AuthenticationServices` + `CryptoKit` + `Security` (no Auth0 SDK).
- **Online-only** (no local store in v1). Nutrition targets are the one piece of
  state moved server-side (§9).
- Single `NavigationStack` rooted at the diary list; toolbar menu for add/profile.
- iPhone-only, portrait-first. Backend base URL switchable via build config.

## Suggested execution order

1. **Testing + CI infra first** — `phase-0-foundation.md` §1.2 with
   [`testing.md`](testing.md) §0 and [`ci.md`](ci.md): create the test target and
   the `test-ios` GitHub Actions job against a trivial walking-skeleton test. The
   **first `ios/` PR must show CI green** so automated testing is the standard from
   commit one, and everything after is built **test-first**.
2. Rest of `phase-0-foundation.md` (auth, networking, models, navigation) — each
   unit added with its tests in the same change, CI staying green.
3. `backend-nutrition-targets.md` (apply migration + metadata; unblocks targets).
4. `auth0-testflight-setup.md` (manual Auth0 setup — required before login works).
5. `phase-1-core-logging.md` (the v1 feature surface), every screen's logic
   landing with its `testing.md` coverage.
6. Ship v1 to TestFlight (PRD §15 Definition of Done).
7. Phases 2–5 as additive follow-ups, each independent.

## Source-of-truth references in this repo

- Web API operations to mirror: `web/src/Api.ts`.
- Macro/stat calculations to port exactly: `web/src/DiaryList.tsx`,
  `web/src/WeeklyStatsCalculations.ts`, `web/src/CircleProgress.tsx`.
- Suggestion sourcing/merge logic: `web/src/NewDiaryEntryForm.tsx`.
- Backend schema/permissions to extend: `graphql-engine/migrations/default/*`,
  `graphql-engine/metadata/databases/default/tables/*`.
- CI conventions: `.github/workflows/ci-cd.yml` (paths-filter + per-package jobs).
</content>
</invoke>
