# Plan: Complete Gleam Port

## Context

The food-diary-frontend has two parallel implementations:

- **SolidJS** (`/src/`) — complete, production-ready, 13 routes
- **Gleam/Lustre** (`/src-gleam/`) — ~35% complete, has DiaryList + DiaryEntryEdit only

Goal: Complete the Gleam port to match all SolidJS functionality, verified against the existing Playwright acceptance test suite.

---

## Phase 1: Gleam Prerequisite Fixes

**`src-gleam/src/app.ffi.mjs`**

- Remove `alert()` call from `clearStoredToken`
- Add `export function getApiBaseUrl() { return location.origin; }` (for relative GraphQL URL)
- Add `export function downloadCsv(content, filename)` (Blob + anchor click pattern)
- Add `export function debounceSearch(fn, delay)` wrapping setTimeout/clearTimeout

**`src-gleam/src/queries.gleam`**

- Fix `get_entry_query` — currently outputs a full `query GetDiaryEntry()` block as a string intended to be embedded inside a mutation, which produces malformed GraphQL. It should only return the field selections, not a standalone query document.
- Fix `update_entry_query` — remove the embedded `get_entry_query` call; just select `id` in the mutation response
- Fix `get_entries_query` — the `offset` is already correct

**`src-gleam/src/food_diary_frontend.gleam`**

- Fix `run_graphql_query` to call `getApiBaseUrl()` FFI and use `/api/v1/graphql` relative URL
- Extend `run_graphql_query` to accept a `json.Json` variables parameter (add alongside existing calls with `json.object([])` default)

---

## Phase 2: Gleam Features to Implement

Priority order — implement each feature against the already-written Playwright tests:

### 1. DiaryEntry Delete + Centralized 401 Handler (HIGH)

New in `queries.gleam`: `delete_entry_mutation()` returning mutation string
New Msgs: `UserDeletedEntry(id: Int)`, `ApiDeletedEntry(Result(Int, rsvp.Error))`
In update: optimistic removal from diary list, restore on error
`handle_api_error` helper: match `rsvp.NetworkError` or HTTP 401/403 → clear token + return `LoggedOut`

### 2. New Diary Entry Form (HIGH)

New Model variant: `DiaryEntryNew(auth, tab, search_query, search_results, recent_entries, time_entries, logging_item)`
New queries: `SearchItemsAndRecipes`, `GetRecentEntryItems`, `GetEntriesAroundTime`, `CreateDiaryEntry`
View: Tabs (Suggestions/Search), ⊕ toggle, inline servings input, Save button
Routing: `["diary_entry", "new"]` → load recent + time-based entries on init

### 3. Nutrition Item CRUD (HIGH)

New Model variants: `NutritionItemShow`, `NutritionItemNew`, `NutritionItemEdit`
New `NutritionItemFormData` type with all 13 macro fields as String (preserve partial input like "1.")
New queries: `GetNutritionItem`, `CreateNutritionItem`, `UpdateNutritionItem`
New FFI: none needed (standard form inputs)

### 4. Recipe CRUD (MEDIUM)

New Model variants: `RecipeShow`, `RecipeNew`, `RecipeEdit`
New `RecipeFormData` type: name, total_servings, recipe_items list
New queries: `GetRecipe`, `CreateRecipe`, `UpdateRecipe`, `SearchItems`
Note: UpdateRecipe must delete old recipe_items + insert new (two mutations — requires sequencing in Gleam effects or batch)

### 5. Trends Page (MEDIUM)

New Model variant: `Trends(auth, trends_data, is_loading)`
New query: `GetWeeklyTrends`
View: 3 SVG line charts via `lustre/element/svg` — compute polyline points from trend values

### 6. Profile Page (MEDIUM)

New Model variant: `UserProfile(auth)`
New query: `ExportEntries`
CSV formatting via FFI `downloadCsv` (format in Gleam using `string.join`, call FFI to trigger download)
Logout button calls `clearStoredToken` FFI + returns `LoggedOut` model + redirects

### 7. Import Page (LOW)

New Model variant: `ImportDiaryEntries(auth, parse_state, saving, error)`
File reading + CSV parsing via FFI (delegate to existing pattern from SolidJS `CSVImport.ts`)
New query: `InsertDiaryEntriesWithNewItems`

---

## Phase 3: Implementation Order

```
Sprint 1 — Foundation
  1. Gleam prerequisite fixes (Phase 1)

Sprint 2 — DiaryList + DiaryEntryEdit
  2. Implement delete + 401 handler in Gleam → verify diary-list
  3. Fix Gleam DiaryEntryEdit (query bug fix) → verify diary-entry-edit

Sprint 3 — New Diary Entry
  4. Implement DiaryEntryNew in Gleam → verify

Sprint 4 — Nutrition Items
  5. Implement NutritionItem Show/New/Edit in Gleam → verify

Sprint 5 — Recipes
  6. Implement Recipe Show/New/Edit in Gleam → verify

Sprint 6 — Supporting Pages
  7. Implement Trends, Profile, Import in Gleam → verify
```

---

## Critical Files

| File                                      | Action    | Purpose                                              |
| ----------------------------------------- | --------- | ---------------------------------------------------- |
| `src-gleam/src/app.ffi.mjs`               | MODIFY    | Fix alert(), add getApiBaseUrl(), downloadCsv()      |
| `src-gleam/src/queries.gleam`             | MODIFY    | Fix malformed queries + add all missing queries      |
| `src-gleam/src/food_diary_frontend.gleam` | MODIFY    | All missing pages: Model, Msg, update, view, routing |
| `src/Api.ts`                              | REFERENCE | Query strings, variable shapes, response types       |

---

## Verification

```bash
# Run acceptance tests against Gleam (gleam dev server must be running on 3001)
BASE_URL=http://localhost:3001 npx playwright test

# Interactive UI for debugging
npx playwright test --ui
```
