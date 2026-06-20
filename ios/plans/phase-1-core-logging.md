# Phase 1 (v1) — Core Logging

**PRD coverage:** §4 (all of 4.1–4.7), §7.1 (ported calculations), §8 (GraphQL
contract), §11 (Phase 1 row), §15 (Definition of Done).

**Goal:** core food-logging **parity** with the web app: diary list with rings
and weekly averages and paging; add/edit/delete entries with search and
suggestions; create/view/edit nutrition items; create/view/edit recipes;
server-stored nutrition targets; profile/logout.

**Depends on:** Phase 0 (auth, networking, navigation, DI, models) and
[`backend-nutrition-targets.md`](backend-nutrition-targets.md) applied.

---

## 1. GraphQL operations (`Networking/Api.swift`, PRD §8)

Mirror `web/src/Api.ts` exactly. Each operation = a query string + a `Codable`
response/variables struct. Request **snake_case** fields and let
`.convertFromSnakeCase` map them (Phase 0 decision — do **not** use the web's
camelCase aliases). Include a shared `Macros` fragment and `diaryEntryFields` as
the web does.

**Queries**
- `GetEntries` — three variants (all / from-date / date-range), `order_by: { day:
  desc, consumed_at: asc }`, selecting `id, consumed_at, calories, servings,
  nutrition_item { id, description, calories, ...Macros }, recipe { id, name,
  calories, total_servings, recipe_items { servings, nutrition_item { ...Macros }}}`.
  `Macros` = `added_sugars_grams, protein_grams, dietary_fiber_grams`.
- `GetWeeklyStats` — `current_week` + `past_four_weeks` `_aggregate { sum {
  calories }}` with `$currentWeekStart, $todayStart, $fourWeeksAgoStart`.
- `SearchItemsAndRecipes($search)` → `food_diary_search_nutrition_items {id,
  description}` + `food_diary_search_recipes {id, name}`.
- `SearchItems($search)` — items only (for recipe-item picking).
- `GetRecentEntryItems` → `food_diary_diary_entry_recent(order_by:{consumed_at:
  desc}, limit:5)`.
- `TopEntriesAroundHour($startHour,$endHour)` →
  `food_diary_top_entries_around_hour(args:{start_hour,end_hour,n:5})`.
- `GetTopLoggedItems` → last 100 `food_diary_diary_entry` (client-side
  most-logged merge, see §4).
- `GetNutritionItem($id)`, `GetRecipe($id)`, `GetDiaryEntry($id)` — detail/edit.
- `GetNutritionTargets` (§9 / backend plan).

**Mutations**
- `CreateNutritionItem($nutritionItem)`, `UpdateItem($id,$attrs)`.
- `CreateRecipe($input)` (nested `recipe_items: { data: [...] }`),
  `UpdateRecipe($id,$attrs,$items)` (**delete-then-insert** recipe items, exactly
  as `web/src/Api.ts updateRecipe` does — one mutation with update + delete +
  insert).
- `CreateDiaryEntry($entry)` (item **xor** recipe input), `UpdateDiaryEntry($id,
  $attrs)` (servings + consumed_at), `DeleteEntry($id)`.
- `SetNutritionTargets($target)` upsert (§9 / backend plan).

> **snake_case for inputs:** the web hand-rolls `objectToSnakeCaseKeys` for insert/
> set inputs. In Swift, give the *input* structs `CodingKeys` (or encode with
> `.convertToSnakeCase`) so `totalFatGrams` → `total_fat_grams`, etc.

Each operation gets a **golden-JSON decode test** (`testing.md`, §12).

---

## 2. Repositories (`Repositories/`, PRD §6.1)

Protocol + concrete impl wrapping `GraphQLClient`, one per domain. Protocols let
view-model tests inject doubles.

- `DiaryRepository`: `entries(page:)` (computes week window, see §3),
  `weeklyStats()`, `entry(id:)`, `createEntry(_:)`, `updateEntry(_:)`,
  `deleteEntry(id:)`.
- `NutritionItemRepository`: `item(id:)`, `create(_:)`, `update(_:)`.
- `RecipeRepository`: `recipe(id:)`, `create(_:)`, `update(_:)`.
- `SearchRepository`: `searchItemsAndRecipes(_:)`, `searchItems(_:)`.
- `SuggestionsRepository` (or fold into Diary): `recent()`, `topAroundHour()`,
  `topLogged()`.
- `TargetsRepository`: `get()`, `save(_:)` (upsert), with in-memory session cache.

---

## 3. Util — ported calculations (`Util/`, PRD §7.1, §4.2) — MUST be unit-tested

Port **exactly** from `web/src/DiaryList.tsx` and
`web/src/WeeklyStatsCalculations.ts`. These are the highest-value tests and the
only ones mandated by the minimal scope (§12, §13).

### 3.1 `MacroCalculations.swift`
```
// recipeTotalForKey: web DiaryList.tsx:40
recipeTotal(key, recipe) =
  sum(item.servings * item.nutritionItem[key]) / max(recipe.totalServings, 1)

// entryTotalMacro: web DiaryList.tsx:55
entryTotal(key, entry) =
  entry.servings * ((entry.nutritionItem?[key] ?? 0) + recipeTotal(key, entry.recipe))

// totalMacro across a day: web DiaryList.tsx:60
dayTotal(key, entries) = entries.reduce(0) { $0 + entryTotal(key, $1) }
```
- `key` ∈ {`protein_grams`, `dietary_fiber_grams`, `added_sugars_grams`,
  `calories`}. Model as a `KeyPath<NutritionItem, Double>` or an enum mapping.
- Per-day **calories** ring uses the server-computed `entry.calories` summed and
  `ceil`-ed (web `DiaryList.tsx:195`), **not** `entryTotal(calories)`. Match this:
  `dayCalories = ceil(entries.reduce(0){ $0 + $1.calories })`.
- Per-entry display rounding: `round(entry.calories)`, `round(entryTotal(protein))`,
  `round(entryTotal(fiber))` (web `DiaryList.tsx:233-241`).

### 3.2 `WeeklyStats.swift` (port `WeeklyStatsCalculations.ts`)
```
calculateDaysBetween(start, end) = max(1, floor((end - start) / 86_400_000ms))
calculateDailyAverage(total, days) = ceil(total / days)         // Math.ceil
calculateFourWeeksDays(now) = calculateDaysBetween(startOfDay(now - 4w), startOfDay(now))
```
- "Last 7 Days" uses `currentWeekDays = 7` (fixed window, web `DiaryList.tsx:116`).
- "4 Week Avg" uses `calculateFourWeeksDays(now)`.
- Aggregate sums may be `null` → coalesce to 0 (web uses `|| 0`).

### 3.3 `DateHelpers.swift`
- `localDay(timestamp)` = start of day in **local** tz (web uses
  `formatISO(startOfDay(parseISO(ts)))`, `DiaryList.tsx:32`). Group entries by this.
- Page window math (web `DiaryList.tsx:92`):
  `pageStart(page) = startOfDay(now - (PAGE_DAYS-1 + page*PAGE_DAYS) days)` as
  ISO/UTC; `PAGE_DAYS = 7`. `entries(page)` queries
  `[pageStart(page), page>0 ? pageStart(page-1) : nil)`.
- Weekly-stats anchors (web `DiaryList.tsx:107-109`): `todayStart =
  startOfDay(now)`, `sevenDaysAgoStart = startOfDay(now-7d)`,
  `fourWeeksAgoStart = startOfDay(now-4w)`.
- Display formatters: time (`parseAndFormatTime`) and day badge, local tz.
- **All date logic is timezone-sensitive** — tests run with
  `TZ=America/Los_Angeles` (PRD §12, matches web).

---

## 4. Feature: Diary list (home) — `Features/Diary/` (PRD §4.2)

`DiaryListViewModel` (`@Observable @MainActor`): owns `page`, `entries`,
`weeklyStats`, `targets`, and `loading/loaded/error`. On `.task`: load page 0
entries + weekly stats + targets concurrently (`async let`).

`DiaryListView`:
- **Header band:** "Last 7 Days" avg kcal/day and "4-Week Avg" kcal/day from
  `WeeklyStats`. "View Trends" link **hidden/deferred** in v1 (PRD §4.2).
- **Grouping:** entries by `localDay`, days **descending**, entries within a day
  **ascending** by `consumed_at` (§3.3, web parity).
- **Per-day rings** (4× `MacroRing`, see §10): Calories (target + max), Protein g,
  Fiber g, Added Sugar g (`isLimit = true`). Values from §3.1.
- **Per-entry row:** `round(calories)` kcal, `round(entryTotal(protein))`g
  protein, `round(entryTotal(fiber))`g fiber; item/recipe name (tappable →
  detail); **RECIPE badge** when `entry.recipe != nil`; serving count + time
  ("N servings at h:mma"); Edit + Delete affordances.
- **Paging:** "← Previous Week" always; "Next Week →" only when `page > 0`
  (web parity); disable while loading.
- **Empty state:** "No entries this week." when the page has none.
- **Delete:** optimistic removal + **rollback on failure** (web `deleteEntry`,
  `DiaryList.tsx:335`): remove from the in-memory list, call `DeleteEntry`; if the
  response has no `data`/throws, restore the entry.

## 5. Feature: Add / edit entry — `Features/Entry/` (PRD §4.3)

`EntryFormViewModel` handles both new and edit.

**New entry** (`NewEntryView`, presented as a sheet or pushed):
- Two modes via a segmented control (web `NewDiaryEntryForm.tsx`): **Suggestions**
  and **Search**.
- **Suggestions** (three sources, each its own query, §1):
  1. "Logged at this time of day" — `TopEntriesAroundHour` with `startHour =
     max(0, utcHour-1)`, `endHour = min(23, utcHour+1)` (web `NewDiaryEntryForm.tsx:64`).
  2. "Recently logged" — `GetRecentEntryItems`.
  3. "Most logged" — client-side merge of last-100 `GetTopLoggedItems`: count by
     `item_<id>`/`recipe_<id>`, sort desc by count, take top 5 (port the
     `Map`-based merge, `NewDiaryEntryForm.tsx:78-101`).
  - Empty: "No suggestions available" when all three are empty.
- **Search** — typeahead over `SearchItemsAndRecipes`; each result is a
  "loggable" row.
- **LoggableItem** (port `NewDiaryEntryForm.tsx:173`): expand to a servings
  field (default 1, decimal), Save → `CreateDiaryEntry` with `{servings,
  nutrition_item_id}` **xor** `{servings, recipe_id}`, brief ✔ confirmation.
- `consumed_at` defaults to now; allow setting it (the web quick-add uses now;
  iOS adds a date/time picker for parity with edit).

**Edit entry** (`EditEntryView`): load via `GetDiaryEntry`; edit **servings** and
**consumed_at**; Save → `UpdateDiaryEntry($id, {servings, consumed_at})`; Delete
from this screen → `DeleteEntry` then pop.

## 6. Feature: Nutrition items — `Features/Items/` (PRD §4.4)

- **Create** (`ItemFormView` + `ItemFormViewModel`): full macro set — description,
  calories, total/saturated/trans/poly/mono fat, cholesterol mg, sodium mg, total
  carbs, fiber, total sugars, added sugars, protein. Numeric fields use decimal
  keypads. Save → `CreateNutritionItem` (input encoded snake_case). The web's
  camera-scan and LLM-autofill buttons are **deferred** (Phase 3) — form is manual
  entry only (PRD §4.4).
- **View** (`ItemDetailView`): macro detail; entry point to Edit.
- **Edit:** load `GetNutritionItem`, Save → `UpdateItem($id, $attrs)`.

## 7. Feature: Recipes — `Features/Recipes/` (PRD §4.5)

- **Create** (`RecipeFormView` + `RecipeFormViewModel`): name, total servings, and
  a list of recipe items — each picked via `SearchItems` (existing items only;
  nested new-item creation is out of scope, matching `web` TODO) + a servings
  value. Save → `CreateRecipe` (nested `recipe_items: { data: [...] }`).
- **View** (`RecipeDetailView`): computed calories + constituent items
  (`GetRecipe`).
- **Edit:** update attrs + **replace** recipe items (delete-then-insert in one
  `UpdateRecipe` mutation, web parity).

## 8. Feature: Nutrition targets — `Features/Targets/` (PRD §4.6, §9)

`TargetsViewModel` + `TargetsView`: edit calories, calories max, protein g, fiber
g, added sugar g. On appear: `GetNutritionTargets`; if no row →
`NutritionTargets.default`. Save → `SetNutritionTargets` upsert. Cache in memory
for the session; the diary list reads from the same `TargetsRepository` so rings
update after a save (PRD §4.6).

## 9. Feature: Profile / settings — `Features/Profile/` (PRD §4.7)

`ProfileView`: show Auth0 user (name/email/picture from id_token/userinfo); link
to **Edit nutrition targets**; **Developer** section (debug builds only, §10) with
the backend environment switcher (production ↔ LAN host); **Log out** (clears
Keychain + in-memory tokens, optionally opens `/v2/logout`, returns to login).

## 10. Design system — `DesignSystem/` (PRD §6.2, decision #12)

- `MacroRing.swift` — the signature progress ring. Port `CircleProgress.tsx`
  semantics with **Swift Charts** or a `Canvas`/trimmed `Circle`:
  - ratio = `value / (max ?? target)`; arc trimmed to `min(ratio, 1)`.
  - **Color rules (exact):** if `isLimit` → red when `value > target`, else green.
    Else if `max != nil && value > max` → red; else if `value >= target` → green;
    else amber. (Web hex: `#f87171` red, `#4ade80` green, `#fbbf24` amber.)
  - Center label = `round(value)` + optional unit.
- `DateBadge.swift` — day badge (port `DateBadge.tsx`).
- `Theme.swift` — colors/spacing; "native base + custom accents" (decision #12):
  HIG foundations plus the signature ring colors above.

---

## 11. Error & session handling (PRD §4.1, §8)

- Any `401/403` surviving a refresh → `APIError.unauthorized` → `AuthService`
  signs out → root routes to login (wired in Phase 0; consumed here).
- `APIError.graphQL` / `.transport` → user-facing message on the relevant
  form/list screen with a retry affordance (online-only UX, PRD §14).
- Each screen has explicit `loading` / `loaded` / `error` states (§6.1).

---

## 12. Tests added in Phase 1 (see `testing.md`)

- `MacroCalculations` — entry/recipe/day math vs. fixtures ported from the web
  test suite (parity).
- `WeeklyStats` — daily-average + 4-week-days math.
- `GraphQLClient` decoding — golden JSON → model for **each** operation, including
  snake_case mapping and the item/recipe XOR.
- Targets get/upsert decode.
- Run with `TZ=America/Los_Angeles`.

---

## 13. Definition of Done (Phase 1 / PRD §15)

- Diary list renders weekly pages with correct per-day rings and 7-day / 4-week
  headers **matching the web app for the same data**.
- Add/edit/delete entries (item and recipe) with search + suggestions; create/edit
  items; create/edit recipes — all working against the live backend.
- Targets persist on the server and drive the rings.
- Delete is optimistic with rollback; expired-token → re-login works.
- Mandatory unit tests pass in CI; manual test plan (§12) passes.
</content>
