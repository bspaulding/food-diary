# Phase 2 — Insights (Trends)

**PRD coverage:** §11 Phase 2; §5 (Trends deferred from v1); §8 (deferred
`GetWeeklyTrends`). Web reference: `web/src/Trends.tsx`, `fetchWeeklyTrends` and
the `food_diary_trends_weekly` view.

**Goal:** a Trends screen with weekly charts (calories, protein, added sugar)
using **Swift Charts** (decision: native, no deps — §13). Un-hide the "View
Trends" link that Phase 1 deferred on the diary header (§4.2).

---

## 1. Backend

No backend change required — the `food_diary_trends_weekly` view and its Hasura
tracking already exist (`graphql-engine/migrations/.../add_trends_weekly_view`,
metadata `food_diary_trends_weekly.yaml`).

## 2. API (`Api.swift`)

Add `GetWeeklyTrends` (mirror `web/src/Api.ts:getWeeklyTrendsQuery`):
```graphql
query GetWeeklyTrends {
  food_diary_trends_weekly { week_of_year protein calories added_sugar }
}
```
Model `WeeklyTrendsData { weekOfYear: String, protein, calories, addedSugar:
Double }` and a `TrendsRepository.weeklyTrends()`.

## 3. Feature `Features/Trends/`

- `TrendsViewModel` (`@Observable @MainActor`): load on `.task`, `loading/loaded/
  error`.
- `TrendsView`: one chart per metric (Calories, Protein, Added Sugar) over
  `week_of_year`, using `Swift Charts` (`LineMark`/`BarMark`). Overlay the
  relevant `NutritionTargets` value as a `RuleMark` reference line where it makes
  sense (calories target, protein target, added-sugar limit) — reuse
  `TargetsRepository`.
- Match web ordering/labeling of `week_of_year`.

## 4. Navigation

- Add `.trends` to the route enum; push from the now-visible "View Trends" link in
  the diary header (`Features/Diary`), and/or the toolbar menu.

## 5. Tests

- `GetWeeklyTrends` golden-JSON decode.
- Any client-side transform of `week_of_year` (sorting/formatting) unit-tested.

## 6. Definition of Done

- Trends screen renders the three weekly series from real data, reachable from the
  diary header; "View Trends" no longer hidden.
</content>
