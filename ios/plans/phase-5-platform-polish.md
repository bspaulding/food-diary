# Phase 5+ — Platform Polish

**PRD coverage:** §11 Phase 5+; §1.2 / §5 (non-goals deferred from v1: iPad
layouts, offline cache, widgets/Shortcuts/HealthKit, App Store readiness).

**Goal:** the long-tail platform work that the v1 architecture was designed to
make additive. Each item below is independent; sequence by value. None require
backend changes beyond what earlier phases established.

---

## 1. iPad adaptive layouts (§1.2, §5)

- Move from iPhone-only portrait to adaptive: `NavigationSplitView` for
  list/detail on regular width; size-class-aware layouts for the diary list,
  forms, and trends.
- Audit the single `NavigationStack` (decision #15) — likely becomes a
  split-view-aware container on iPad while staying a stack on iPhone.
- Enable iPad in deployment info; test landscape.

## 2. Read cache / offline reads (§5, §14 mitigation)

- Add **SwiftData** as a read-through cache for diary entries, items, recipes, and
  targets (the PRD names SwiftData; iOS 18 target supports it). This is the planned
  fix for the "online-only on poor connectivity" risk (§14).
- Strategy: cache last-fetched results keyed by query window; show cached data
  instantly, refresh in background, reconcile. **Reads only** — mutation queue /
  offline editing remains a non-goal (§1.2) unless explicitly added later.
- Keep the repository protocols (§6.1) as the seam: a caching repo decorator wraps
  the network repo, so view models are unchanged.

## 3. Widgets / Shortcuts (§5)

- WidgetKit widget(s): today's macro rings (Calories/Protein/Fiber/Added Sugar)
  reusing `MacroRing` + `MacroCalculations`. Requires a shared framework/app-group
  for the calculation + model code (extract `Util/` + `Models/` into a shared
  target).
- App Intents / Shortcuts: "Log <item>" quick action driving `CreateDiaryEntry`.

## 4. HealthKit (§5)

- Optional read/write of dietary energy + macronutrients to HealthKit
  (`HKQuantityType` energy, protein, fiber, sugar). Gate behind a Profile toggle
  with `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`.
- Decide direction (write logged entries → Health, and/or read Health data in);
  start with write-on-log.

## 5. App Store readiness (§1.2 non-goal for v1, target later)

- Privacy nutrition labels, App Privacy details, support URL, marketing assets.
- Account deletion path (App Store requirement) — wire to Auth0 + a backend
  user-data deletion routine (new backend work; scope separately).
- Review-proof the auth flow (`ASWebAuthenticationSession` is App-Store-friendly).
- Promote from TestFlight-only (decision #1) to public release.

---

## Definition of Done (per item)

Each sub-feature ships independently with: the additive code behind existing
repository/protocol seams, its own unit tests where logic is non-trivial (cache
reconciliation, HealthKit mapping, widget calculations reuse the Phase 1 tested
`MacroCalculations`), and no regression to the v1 online-only path.
</content>
