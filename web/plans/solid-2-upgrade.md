# Plan: Solid 2.0 Upgrade

## Status: not started — blocked on Solid 2.0 leaving RC

As of this writing, [Solid 2.0](https://www.solidjs.com/blog/solid-2-0-rc-the-big-reveal)
is at release candidate (`2.0.0-rc.x`), not a stable release, and
`@solidjs/router`'s 2.0 line and `@solidjs/testing-library`'s 1.0 line are
similarly unreleased (`-next`/`-beta`). Don't start the actual migration
until `solid-js`, `@solidjs/router`, and `@solidjs/testing-library` all have
stable 2.0/2.0/1.0 releases. Check `npm view solid-js dist-tags.latest` (and
the same for the other two) before picking this back up.

Prep work that's safe to do on 1.x regardless has already shipped — see
below — so the migration itself should be smaller than it would've been
starting from scratch.

## Prep work already done (on 1.x, safe, shipped independently)

- `@solidjs/router` `0.10.0` → `1.0.0` (PR #38)
- Coverage thresholds raised to match actual coverage, plus regression
  tests for `createAuthorizedResource`'s `.loading`/`mutate`/`refetch`/
  reactive-source-change contract and for `NewRecipeForm`'s DOM-identity
  behavior (PR #39)
- `vite-plugin-solid` `2.11.11` → `2.11.14`, `on()` removed from
  `CameraModal.tsx` (PR #40)
- 5 of 6 `<Index>` call sites converted to `<For>`: `SegmentedControl`,
  `SuggestionsList`, `RecipeShow`, `DiaryList` (both lists),
  `ImportDiaryEntries` (PR #41)

## What's actually left when 2.0 is stable

### 1. Rewrite `createAuthorizedResource.ts` off `createResource`

This is the real migration work. `createResource` is removed in 2.0 —
async flows through `createMemo` instead. `createAuthorizedResource` wraps
`createResource` and is the app's central data-fetching abstraction,
consumed by 11 components: `Trends`, `NutritionItemEdit`, `RecipeShow`,
`RecipeEdit`, `NutritionItemShow`, `DiaryList`, `DiaryEntryEditForm`,
`SearchItemsForm`, `NewDiaryEntryForm` (×3).

The external contract to preserve (already pinned down by tests in
`createAuthorizedResource.test.tsx`, added in PR #39 — run these against
the rewrite before touching any call site):

- Returns `[accessor, { mutate, refetch }]`, where the accessor also
  exposes `.loading` (read directly by `SearchItemsForm`) and presumably
  `.error`.
- `mutate(value)` updates the value directly without re-invoking the
  fetcher.
- `refetch()` re-invokes the fetcher.
- Changing the reactive `source` re-invokes the fetcher with the new
  source value.
- On `AuthorizationError`, the client logs out and the error re-throws;
  other errors just re-throw.

Once the rewrite passes those tests, the call sites listed above shouldn't
need to change — they only use the `[accessor, { mutate, refetch }]` shape
and `.loading`, none of which needs to change externally.

### 2. `NewRecipeForm.tsx`: move edit state to `createStore`, then convert its `<Index>` to `<For>`

This is the one `<Index>` left, and it's load-bearing: every keystroke on
a servings input replaces that row's object in `recipe_items`
(`{...item(), servings}` inside a full-array rebuild), so `<For>`'s
reference-based keying would tear down and recreate the `<input>` mid-edit,
losing focus. This is now pinned down by a regression test in
`NewRecipeForm.test.tsx` (PR #39) — if that test starts failing, something
regressed the DOM-identity guarantee.

Fix the root cause instead of working around it: replace the
`createSignal<Recipe>` + full-array-rebuild pattern with `solid-js/store`'s
`createStore` and in-place path mutation (`setInput("recipe_items", i,
"servings", value)`), so row objects keep stable identity across edits.
Once that's true, `<Index>` there can move to `<For>` like the other five
did, and the DOM-identity regression test above should keep passing
(re-verify it explicitly — it's the safety net for this exact change).

Note 2.0 changes stores too (draft-mutation setters replace `produce`/
`createMutable`, neither of which this app uses) — check the 2.0 store
API against `createStore`'s 1.x API before writing this, in case the
migration guide recommends doing this step as part of the 2.0 bump itself
rather than before it.

### 3. Bump `@solidjs/router` to its 2.0 line

Do this in lockstep with the `solid-js` bump, not independently — unlike
the `0.10` → `1.0` bump (PR #38), 2.0 is a real breaking jump for the
router too. Re-check for usage of `cache`/`query`, `action`, `load`/
`preload`, or `createAsyncStorage` before upgrading (none were in use as
of PR #38, but re-check — this plan may be stale by the time it's acted
on). `useParams()`'s stricter `string | undefined` typing (surfaced by the
1.0 bump, fixed in `RecipeShow.tsx`) is a sign more type-strictness changes
are likely.

### 4. Bump `@solidjs/testing-library` to its 1.0 line

Needed for the test suite to run against Solid 2.0 at all.

### 5. Everything else in the codebase

A grep for 2.0-removed/changed APIs (`createResource`, `startTransition`,
`useTransition`, `createComputed`, `on(`, `produce(`, `createMutable`,
`Suspense`, `<Index`, `batch(`) as of this writing turned up nothing
beyond what's listed above — `batch`, `startTransition`/`useTransition`,
`createComputed`, `produce`, `createMutable`, and `Suspense`/
`ErrorBoundary` aren't used anywhere in `web/src`. Re-run that grep when
picking this up again in case that's changed.

## Gotchas learned doing the prep work (apply these to the real migration too)

- **`on(dep, fn)` isn't just `{ defer }` sugar** — it also makes every
  signal read _inside_ `fn` other than `dep` itself untracked. A naive
  `createEffect(() => /* on's fn body */)` rewrite that reads-and-writes
  another signal in the body will make that signal a tracked dependency of
  its own effect, which can self-trigger into an infinite loop if the
  value written differs from the value read each time (this bit us in
  `CameraModal.tsx`'s object-URL effect: `URL.createObjectURL()` returns a
  distinct value every call in a real browser, though the test's mock
  originally always returned the same string, which is exactly why it
  didn't get caught until this was reasoned through by hand — see PR #40's
  description). Wrap the non-tracked reads/writes in `untrack()` when
  converting `on()` away, and if a mock is standing in for a
  browser API that never repeats a value, make the mock never repeat a
  value either.
- **`<Index>` vs `<For>` is a real semantic difference, not just an API
  rename** — before converting any remaining `<Index>`, check whether the
  row callback both reads and writes back an object at that array
  position (a controlled input bound to `item().field` whose `onInput`
  replaces the object at that index). If so, `<Index>`'s index-stable DOM
  reuse is load-bearing (keeps focus during edits) and converting to
  `<For>` needs the object-identity-churn root cause fixed first (see
  item 2 above), not just a mechanical swap.
- **Router version bumps can carry real type-strictness changes even when
  the changelog calls them non-breaking** — `useParams()`'s return type
  got stricter between `0.10` and `1.0` even though that bump was billed
  as "a version realignment, not a breaking change." Run `tsc --noEmit`
  after any router bump, don't just trust the changelog.
- **Mocked browser APIs that always return the same value can mask real
  bugs** — if a mock stands in for something that's unique per call in
  production (`URL.createObjectURL`, IDs, timestamps), make the mock
  produce distinct values too, or a signal-equality bail-out can silently
  hide a broken effect.
