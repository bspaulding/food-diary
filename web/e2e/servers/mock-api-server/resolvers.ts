import {
  MockApiStore,
  type NutritionItemAttrsRecord,
  type NutritionItemRecord,
  type RecipeItemRecord,
} from "./store.ts";

/**
 * Dispatches by substring match on the operation name in the query text --
 * exactly what web/src/test-setup-browser.ts's MSW handler already did,
 * just moved server-side and made stateful. No real GraphQL parser/executor:
 * the app only ever sends one of a small, fixed set of named operations
 * (specs/2026-08-26-web-e2e-acceptance-test-harness.md Appendix A), and
 * this mock doesn't enforce field-selection sets -- it returns whichever
 * fields exist, a superset of what any one query asks for is harmless.
 *
 * Ordering note: some operation names are substrings of others
 * ("SearchItems" is a prefix of "SearchItemsAndRecipes",
 * "ExportEntries" is a prefix of "ExportEntriesWithDateRange") so those
 * pairs are deliberately handled by one shared branch rather than two
 * separately-ordered `includes()` checks that could silently pick the
 * wrong one.
 *
 * Returns `null` for an operation this mock doesn't recognize, which the
 * caller turns into a loud 500 -- mirroring the "strict mode" MSW setup
 * this replaces, so the mock can't silently drift from what the app sends.
 */
export type MockGraphQLErrorResult = {
  __mockGraphQLError: true;
  message: string;
};

/**
 * Any variable value equal to this exact string makes the mock reject the
 * whole operation with a real `{errors: [...]}` GraphQL-error body at HTTP
 * 200 -- the shape a real backend uses for a rejected mutation (a check
 * constraint or permission failure, say), as opposed to this mock's
 * generic "unrecognized operation" 500 in server.ts. It's the E2E suite's
 * one deliberate, documented way to trigger that response shape, since no
 * organic mock failure reaches it. Must match the same literal in
 * web/e2e/tests/full-app-journey.spec.ts.
 */
export const E2E_GRAPHQL_ERROR_SENTINEL = "__E2E_TRIGGER_GRAPHQL_ERROR__";

function containsErrorSentinel(value: unknown): boolean {
  if (typeof value === "string") return value === E2E_GRAPHQL_ERROR_SENTINEL;
  if (Array.isArray(value)) return value.some(containsErrorSentinel);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsErrorSentinel);
  }
  return false;
}

export function resolveOperation(
  query: string,
  variables: Record<string, unknown>,
  store: MockApiStore,
  sub: string,
): Record<string, unknown> | MockGraphQLErrorResult | null {
  if (containsErrorSentinel(variables)) {
    return {
      __mockGraphQLError: true,
      message: "mock server: rejected due to E2E error sentinel",
    };
  }
  if (query.includes("GetWeeklyStats")) {
    return resolveGetWeeklyStats(variables, store);
  }
  if (query.includes("SearchItems")) {
    return resolveSearch(query, variables, store);
  }
  if (query.includes("GetNutritionItem")) {
    return resolveGetNutritionItem(variables, store);
  }
  if (query.includes("GetRecentEntryItems")) {
    return resolveGetRecentEntryItems(store);
  }
  if (query.includes("TopEntriesAroundHour")) {
    return resolveTopEntriesAroundHour(variables, store);
  }
  if (query.includes("GetTopLoggedItems")) {
    return resolveGetTopLoggedItems(store);
  }
  if (query.includes("GetRecipe")) {
    return resolveGetRecipe(variables, store);
  }
  if (query.includes("ExportEntries")) {
    return resolveExportEntries(variables, store);
  }
  if (query.includes("GetDiaryEntry")) {
    return resolveGetDiaryEntry(variables, store);
  }
  if (query.includes("GetEntries")) {
    return resolveGetEntries(variables, store);
  }
  if (query.includes("GetWeeklyTrends")) {
    return resolveGetWeeklyTrends(store);
  }
  if (query.includes("GetNutritionTargets")) {
    return resolveGetNutritionTargets(store);
  }
  if (query.includes("CreateNutritionItem")) {
    return resolveCreateNutritionItem(variables, store);
  }
  if (query.includes("UpdateItem")) {
    return resolveUpdateItem(variables, store);
  }
  if (query.includes("CreateDiaryEntry")) {
    return resolveCreateDiaryEntry(variables, store);
  }
  if (query.includes("DeleteEntry")) {
    return resolveDeleteEntry(variables, store);
  }
  if (query.includes("CreateRecipe")) {
    return resolveCreateRecipe(variables, store);
  }
  if (query.includes("UpdateRecipe")) {
    return resolveUpdateRecipe(variables, store);
  }
  if (query.includes("InsertDiaryEntriesWithNewItems")) {
    return resolveInsertDiaryEntriesWithNewItems(variables, store);
  }
  if (query.includes("UpdateDiaryEntry")) {
    return resolveUpdateDiaryEntry(variables, store);
  }
  if (query.includes("SetNutritionTargets")) {
    return resolveSetNutritionTargets(variables, store, sub);
  }
  return null;
}

// --- helpers ---------------------------------------------------------------

function toDateRange(variables: { startDate?: string; endDate?: string }): {
  gte?: string;
  lt?: string;
  lte?: string;
} {
  if (variables.startDate && variables.endDate) {
    return { gte: variables.startDate, lt: variables.endDate };
  }
  if (variables.startDate) {
    return { gte: variables.startDate };
  }
  return {};
}

function sortForGetEntries<T extends { consumed_at: string }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    const dayA = a.consumed_at.slice(0, 10);
    const dayB = b.consumed_at.slice(0, 10);
    if (dayA !== dayB) return dayA < dayB ? 1 : -1;
    return a.consumed_at < b.consumed_at
      ? -1
      : a.consumed_at > b.consumed_at
        ? 1
        : 0;
  });
}

/** ISO 8601 week number (1-53), matching Postgres's EXTRACT(WEEK FROM ...). */
function isoWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** GetNutritionItem is the one query that aliases snake_case DB columns to
 * camelCase response keys, matching web/src/Api.ts's `NutritionItem` type. */
function nutritionItemToCamelCase(
  item: NutritionItemRecord,
): Record<string, unknown> {
  return {
    id: item.id,
    description: item.description,
    calories: item.calories,
    totalFatGrams: item.total_fat_grams,
    saturatedFatGrams: item.saturated_fat_grams,
    transFatGrams: item.trans_fat_grams,
    polyunsaturatedFatGrams: item.polyunsaturated_fat_grams,
    monounsaturatedFatGrams: item.monounsaturated_fat_grams,
    cholesterolMilligrams: item.cholesterol_milligrams,
    sodiumMilligrams: item.sodium_milligrams,
    totalCarbohydrateGrams: item.total_carbohydrate_grams,
    dietaryFiberGrams: item.dietary_fiber_grams,
    totalSugarsGrams: item.total_sugars_grams,
    addedSugarsGrams: item.added_sugars_grams,
    proteinGrams: item.protein_grams,
  };
}

// --- queries -----------------------------------------------------------------

function resolveGetEntries(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const vars = variables as { startDate?: string; endDate?: string };
  const entries = store
    .listDiaryEntries(toDateRange(vars))
    .map((e) => store.expandDiaryEntry(e));
  return { food_diary_diary_entry: sortForGetEntries(entries) };
}

function resolveGetWeeklyStats(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const vars = variables as {
    currentWeekStart: string;
    todayStart: string;
    fourWeeksAgoStart: string;
  };
  const sumCalories = (gte: string, lt: string): number | null => {
    const entries = store.listDiaryEntries({ gte, lt });
    if (entries.length === 0) return null;
    return entries.reduce((sum, e) => sum + store.diaryEntryCalories(e), 0);
  };
  return {
    current_week: {
      aggregate: {
        sum: { calories: sumCalories(vars.currentWeekStart, vars.todayStart) },
      },
    },
    past_four_weeks: {
      aggregate: {
        sum: { calories: sumCalories(vars.fourWeeksAgoStart, vars.todayStart) },
      },
    },
  };
}

function resolveSearch(
  query: string,
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { search } = variables as { search: string };
  const items = store
    .searchNutritionItems(search)
    .map((item) => ({ id: item.id, description: item.description }));
  if (query.includes("SearchItemsAndRecipes")) {
    const recipes = store
      .searchRecipes(search)
      .map((r) => ({ id: r.id, name: r.name }));
    return {
      food_diary_search_nutrition_items: items,
      food_diary_search_recipes: recipes,
    };
  }
  return { food_diary_search_nutrition_items: items };
}

function resolveGetNutritionItem(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  // Real Hasura coerces a numeric string to Int for an `Int!` variable
  // (the frontend sends route-param ids as strings in a couple of places
  // and relies on this); Number(...) here matches that leniency instead
  // of this mock's otherwise-strict Map<number, ...> lookup rejecting it.
  const { id } = variables as { id: number | string };
  const item = store.getNutritionItem(Number(id));
  return {
    food_diary_nutrition_item_by_pk: item
      ? nutritionItemToCamelCase(item)
      : null,
  };
}

function summarizeEntryForSuggestions(
  entry: ReturnType<MockApiStore["expandDiaryEntry"]>,
): Record<string, unknown> {
  return {
    consumed_at: entry.consumed_at,
    nutrition_item: entry.nutrition_item
      ? {
          id: entry.nutrition_item.id,
          description: entry.nutrition_item.description,
        }
      : null,
    recipe: entry.recipe
      ? { id: entry.recipe.id, name: entry.recipe.name }
      : null,
  };
}

function resolveGetRecentEntryItems(
  store: MockApiStore,
): Record<string, unknown> {
  const entries = store
    .listDiaryEntries()
    .sort((a, b) => (a.consumed_at < b.consumed_at ? 1 : -1))
    .slice(0, 5)
    .map((e) => summarizeEntryForSuggestions(store.expandDiaryEntry(e)));
  return { food_diary_diary_entry_recent: entries };
}

function resolveTopEntriesAroundHour(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { startHour, endHour } = variables as {
    startHour: number;
    endHour: number;
  };
  const matching = store.listDiaryEntries().filter((e) => {
    const hour = new Date(e.consumed_at).getUTCHours();
    return hour >= startHour && hour <= endHour;
  });

  const groups = new Map<
    string,
    {
      nutritionItemId: number | null;
      recipeId: number | null;
      maxConsumedAt: string;
      count: number;
    }
  >();
  for (const entry of matching) {
    const key = `${entry.nutrition_item_id ?? "null"}:${entry.recipe_id ?? "null"}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (entry.consumed_at > group.maxConsumedAt)
        group.maxConsumedAt = entry.consumed_at;
    } else {
      groups.set(key, {
        nutritionItemId: entry.nutrition_item_id,
        recipeId: entry.recipe_id,
        maxConsumedAt: entry.consumed_at,
        count: 1,
      });
    }
  }

  const top = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((group) => {
      const nutritionItem =
        group.nutritionItemId !== null
          ? store.getNutritionItem(group.nutritionItemId)
          : null;
      const recipe =
        group.recipeId !== null ? store.expandRecipe(group.recipeId) : null;
      return {
        consumed_at: group.maxConsumedAt,
        nutrition_item: nutritionItem
          ? { id: nutritionItem.id, description: nutritionItem.description }
          : null,
        recipe: recipe ? { id: recipe.id, name: recipe.name } : null,
      };
    });

  return { food_diary_top_entries_around_hour: top };
}

function resolveGetTopLoggedItems(
  store: MockApiStore,
): Record<string, unknown> {
  const entries = store
    .listDiaryEntries()
    .sort((a, b) => (a.consumed_at < b.consumed_at ? 1 : -1))
    .slice(0, 100)
    .map((e) => summarizeEntryForSuggestions(store.expandDiaryEntry(e)));
  return { food_diary_diary_entry: entries };
}

function resolveGetRecipe(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { id } = variables as { id: number };
  return { food_diary_recipe_by_pk: store.expandRecipe(id) };
}

function resolveExportEntries(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const vars = variables as { startDate?: string; endDate?: string };
  const range =
    vars.startDate && vars.endDate
      ? { gte: vars.startDate, lte: vars.endDate }
      : {};
  const entries = store
    .listDiaryEntries(range)
    .map((e) => store.expandDiaryEntry(e));
  return { food_diary_diary_entry: entries };
}

function resolveGetDiaryEntry(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  // See resolveGetNutritionItem's note: real Hasura coerces a numeric
  // string to Int for an `Int!` variable, which the frontend relies on.
  const { id } = variables as { id: number | string };
  const entry = store.getDiaryEntry(Number(id));
  return {
    food_diary_diary_entry_by_pk: entry ? store.expandDiaryEntry(entry) : null,
  };
}

function resolveGetWeeklyTrends(store: MockApiStore): Record<string, unknown> {
  const byWeek = new Map<
    number,
    { calories: number[]; protein: number[]; addedSugar: number[] }
  >();
  for (const entry of store.listDiaryEntries()) {
    const week = isoWeekNumber(new Date(entry.consumed_at));
    const bucket = byWeek.get(week) ?? {
      calories: [],
      protein: [],
      addedSugar: [],
    };
    bucket.calories.push(store.diaryEntryCalories(entry));
    bucket.protein.push(store.diaryEntryProtein(entry));
    bucket.addedSugar.push(store.diaryEntryAddedSugar(entry));
    byWeek.set(week, bucket);
  }
  const trends = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, bucket]) => ({
      week_of_year: week,
      calories: average(bucket.calories),
      protein: average(bucket.protein),
      added_sugar: average(bucket.addedSugar),
    }));
  return { food_diary_trends_weekly: trends };
}

function resolveGetNutritionTargets(
  store: MockApiStore,
): Record<string, unknown> {
  const target = store.getNutritionTarget();
  return { food_diary_nutrition_target: target ? [target] : [] };
}

// --- mutations ---------------------------------------------------------------

function resolveCreateNutritionItem(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { nutritionItem } = variables as {
    nutritionItem: NutritionItemAttrsRecord;
  };
  const created = store.createNutritionItem(nutritionItem);
  return { insert_food_diary_nutrition_item_one: { id: created.id } };
}

function resolveUpdateItem(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { id, attrs } = variables as {
    id: number;
    attrs: Partial<NutritionItemAttrsRecord> & { id?: number };
  };
  const { id: _ignoredId, ...rest } = attrs;
  const updated = store.updateNutritionItem(id, rest);
  return {
    update_food_diary_nutrition_item_by_pk: updated ? { id: updated.id } : null,
  };
}

function resolveCreateDiaryEntry(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { entry } = variables as {
    entry: { servings: number; nutrition_item_id?: number; recipe_id?: number };
  };
  const created = store.createDiaryEntry(entry);
  return { insert_food_diary_diary_entry_one: { id: created.id } };
}

function resolveDeleteEntry(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { id } = variables as { id: number };
  const deleted = store.deleteDiaryEntry(id);
  return {
    delete_food_diary_diary_entry_by_pk: deleted ? { id: deleted.id } : null,
  };
}

function resolveCreateRecipe(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { input } = variables as {
    input: {
      name: string;
      total_servings: number;
      recipe_items: { data: RecipeItemRecord[] };
    };
  };
  const created = store.createRecipe(
    input.name,
    input.total_servings,
    input.recipe_items.data,
  );
  return { insert_food_diary_recipe_one: { id: created.id } };
}

function resolveUpdateRecipe(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { id, attrs, items } = variables as {
    id: number;
    attrs: { name?: string; total_servings?: number };
    items: Array<{
      servings: number;
      nutrition_item_id: number;
      recipe_id: number;
    }>;
  };
  const previousItemCount = store.getRecipe(id)?.recipe_items.length ?? 0;
  const updated = store.updateRecipe(
    id,
    attrs,
    items.map((item) => ({
      nutrition_item_id: item.nutrition_item_id,
      servings: item.servings,
    })),
  );
  return {
    update_food_diary_recipe_by_pk: updated ? { id: updated.id } : null,
    delete_food_diary_recipe_item: { affected_rows: previousItemCount },
    insert_food_diary_recipe_item: { affected_rows: items.length },
  };
}

function resolveInsertDiaryEntriesWithNewItems(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { entries } = variables as {
    entries: Array<{
      consumed_at: string;
      servings: number;
      nutrition_item: { data: NutritionItemAttrsRecord };
    }>;
  };
  for (const entry of entries) {
    const item = store.createNutritionItem(entry.nutrition_item.data);
    store.createDiaryEntry({
      servings: entry.servings,
      consumed_at: entry.consumed_at,
      nutrition_item_id: item.id,
    });
  }
  return { insert_food_diary_diary_entry: { affected_rows: entries.length } };
}

function resolveUpdateDiaryEntry(
  variables: Record<string, unknown>,
  store: MockApiStore,
): Record<string, unknown> {
  const { id, attrs } = variables as {
    id: number;
    attrs: { servings?: number; consumed_at?: string; id?: number };
  };
  const { id: _ignoredId, ...rest } = attrs;
  const updated = store.updateDiaryEntry(id, rest);
  return {
    update_food_diary_diary_entry_by_pk: updated ? { id: updated.id } : null,
  };
}

function resolveSetNutritionTargets(
  variables: Record<string, unknown>,
  store: MockApiStore,
  sub: string,
): Record<string, unknown> {
  const { target } = variables as {
    target: {
      calories: number;
      calories_max: number;
      protein_grams: number;
      dietary_fiber_grams: number;
      added_sugars_grams: number;
    };
  };
  const saved = store.setNutritionTarget(sub, target);
  return { insert_food_diary_nutrition_target_one: { user_id: saved.user_id } };
}
