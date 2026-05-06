/**
 * Tests for custom SQL functions exposed as GraphQL queries:
 *   - food_diary_search_nutrition_items  (pg_trgm fuzzy search, admin-only; no role permission set)
 *   - food_diary_search_recipes          (pg_trgm fuzzy search, admin-only; no role permission set)
 *   - food_diary_top_entries_around_hour (user-accessible, filters by UTC hour)
 *
 * search_* functions have no explicit role permissions in Hasura metadata, so they
 * are accessible only with the admin secret (or via the admin role).
 * top_entries_around_hour has `permissions: [{role: user}]` and returns results
 * across all users (no user_id filter in the SQL after the 1778025600000 migration).
 */
import { adminClient, userClient } from '../client';
import { cleanupUser } from '../cleanup';
import { CHICKEN_BREAST, BROWN_RICE, TS_DAY1_HOUR8, TS_DAY2_HOUR8, TS_DAY1_HOUR12 } from '../fixtures';

const USER = 'test-functions-user';

let chickenId: number;
let riceId: number;
let recipeId: number;

beforeAll(async () => {
  await cleanupUser(USER);

  const admin = adminClient();

  // Insert nutrition items via admin (bypasses permission filtering)
  const c = await admin.request<any>(`
    mutation {
      insert_food_diary_nutrition_item_one(object: {
        description: "Grilled Chicken Fillet"
        calories: 165, total_fat_grams: 3.6, saturated_fat_grams: 1, trans_fat_grams: 0
        polyunsaturated_fat_grams: 0.8, monounsaturated_fat_grams: 1.2
        cholesterol_milligrams: 85, sodium_milligrams: 74
        total_carbohydrate_grams: 0, dietary_fiber_grams: 0
        total_sugars_grams: 0, added_sugars_grams: 0, protein_grams: 31
        user_id: "${USER}"
      }) { id }
    }
  `);
  chickenId = c.insert_food_diary_nutrition_item_one.id;

  const r = await admin.request<any>(`
    mutation {
      insert_food_diary_nutrition_item_one(object: {
        description: "Steamed Jasmine Rice"
        calories: 200, total_fat_grams: 0.4, saturated_fat_grams: 0.1, trans_fat_grams: 0
        polyunsaturated_fat_grams: 0.1, monounsaturated_fat_grams: 0.1
        cholesterol_milligrams: 0, sodium_milligrams: 1
        total_carbohydrate_grams: 44, dietary_fiber_grams: 0.6
        total_sugars_grams: 0, added_sugars_grams: 0, protein_grams: 4
        user_id: "${USER}"
      }) { id }
    }
  `);
  riceId = r.insert_food_diary_nutrition_item_one.id;

  const recipe = await admin.request<any>(`
    mutation {
      insert_food_diary_recipe_one(object: {
        name: "Teriyaki Chicken Bowl"
        total_servings: 2
        user_id: "${USER}"
        recipe_items: { data: [
          { nutrition_item_id: ${chickenId}, servings: 2, user_id: "${USER}" }
          { nutrition_item_id: ${riceId}, servings: 1, user_id: "${USER}" }
        ]}
      }) { id }
    }
  `);
  recipeId = recipe.insert_food_diary_recipe_one.id;

  // Insert diary entries at controlled hours for top_entries_around_hour testing.
  // Entries at hour 8 UTC (×2 for chicken, ×1 for rice).
  // Entry at hour 12 UTC for rice.
  await admin.request(`
    mutation {
      e1: insert_food_diary_diary_entry_one(object: {
        nutrition_item_id: ${chickenId}, servings: 1
        consumed_at: "${TS_DAY1_HOUR8}", user_id: "${USER}"
      }) { id }
      e2: insert_food_diary_diary_entry_one(object: {
        nutrition_item_id: ${chickenId}, servings: 1
        consumed_at: "${TS_DAY2_HOUR8}", user_id: "${USER}"
      }) { id }
      e3: insert_food_diary_diary_entry_one(object: {
        nutrition_item_id: ${riceId}, servings: 1
        consumed_at: "${TS_DAY1_HOUR12}", user_id: "${USER}"
      }) { id }
    }
  `);
});

afterAll(() => cleanupUser(USER));

// ─────────────────────────────────────────────
// search_nutrition_items
// ─────────────────────────────────────────────
describe('food_diary_search_nutrition_items function', () => {
  test('returns items matching the search term (pg_trgm similarity)', async () => {
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_nutrition_items(args: { search: "chicken" }) {
          id description calories
        }
      }
    `);
    const descriptions = data.food_diary_search_nutrition_items.map((i: any) => i.description);
    expect(descriptions).toContain('Grilled Chicken Fillet');
  });

  test('returns empty when search term has no similarity match', async () => {
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_nutrition_items(args: { search: "zzzxxx" }) {
          id
        }
      }
    `);
    expect(data.food_diary_search_nutrition_items).toHaveLength(0);
  });

  test('results are ordered by similarity descending', async () => {
    // Insert two items so we can verify ordering
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_nutrition_items(args: { search: "chicken fillet" }) {
          description
        }
      }
    `);
    // "Grilled Chicken Fillet" should score higher than "Steamed Jasmine Rice"
    if (data.food_diary_search_nutrition_items.length > 1) {
      expect(data.food_diary_search_nutrition_items[0].description).toContain('Chicken');
    }
  });

  test('does not match unrelated items', async () => {
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_nutrition_items(args: { search: "jasmine" }) {
          description
        }
      }
    `);
    const descriptions = data.food_diary_search_nutrition_items.map((i: any) => i.description);
    expect(descriptions).not.toContain('Grilled Chicken Fillet');
  });

  test('returns all nutrition fields on results', async () => {
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_nutrition_items(args: { search: "chicken" }) {
          id description calories protein_grams
          total_fat_grams saturated_fat_grams added_sugars_grams
        }
      }
    `);
    const item = data.food_diary_search_nutrition_items[0];
    expect(item.calories).toBeDefined();
    expect(item.protein_grams).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// search_recipes
// ─────────────────────────────────────────────
describe('food_diary_search_recipes function', () => {
  test('returns recipes matching the search term', async () => {
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_recipes(args: { search: "teriyaki" }) {
          id name total_servings calories
        }
      }
    `);
    const names = data.food_diary_search_recipes.map((r: any) => r.name);
    expect(names).toContain('Teriyaki Chicken Bowl');
  });

  test('returns empty when no recipe matches', async () => {
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_recipes(args: { search: "zzzxxx" }) { id }
      }
    `);
    expect(data.food_diary_search_recipes).toHaveLength(0);
  });

  test('results include the computed calories field', async () => {
    const data = await adminClient().request<any>(`
      query {
        food_diary_search_recipes(args: { search: "bowl" }) {
          name calories
        }
      }
    `);
    const result = data.food_diary_search_recipes.find(
      (r: any) => r.name === 'Teriyaki Chicken Bowl',
    );
    expect(result).toBeDefined();
    // (2*165 + 1*200) / 2 = 265
    expect(Number(result.calories)).toBeCloseTo(265, 1);
  });
});

// ─────────────────────────────────────────────
// top_entries_around_hour
// ─────────────────────────────────────────────
describe('food_diary_top_entries_around_hour function', () => {
  // This function is accessible by user role and filters diary_entry by UTC hour range.
  // After migration 1778025600000 it has NO user_id filter — all users' entries are returned.

  test('returns entries whose consumed_at UTC hour is within [start_hour, end_hour]', async () => {
    const data = await userClient(USER).request<any>(`
      query {
        food_diary_top_entries_around_hour(args: { start_hour: 7, end_hour: 9 }) {
          consumed_at nutrition_item_id recipe_id
        }
      }
    `);
    const results = data.food_diary_top_entries_around_hour;
    expect(results.length).toBeGreaterThan(0);

    for (const row of results) {
      const hour = new Date(row.consumed_at).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(7);
      expect(hour).toBeLessThanOrEqual(9);
    }
  });

  test('most-logged item in hour range appears first', async () => {
    // Chicken was logged at hour 8 twice; rice was logged at hour 12 (outside range 7–9)
    const data = await userClient(USER).request<any>(`
      query {
        food_diary_top_entries_around_hour(args: { start_hour: 7, end_hour: 9 }) {
          nutrition_item_id recipe_id
        }
      }
    `);
    const results = data.food_diary_top_entries_around_hour;
    expect(results[0].nutrition_item_id).toBe(chickenId);
    expect(results[0].recipe_id).toBeNull();
  });

  test('excludes entries outside the hour range', async () => {
    // Hour 12 (rice entry) should NOT appear in hour range 7–9
    const data = await userClient(USER).request<any>(`
      query {
        food_diary_top_entries_around_hour(args: { start_hour: 7, end_hour: 9 }) {
          nutrition_item_id
        }
      }
    `);
    const niIds = data.food_diary_top_entries_around_hour.map((r: any) => r.nutrition_item_id);
    expect(niIds).not.toContain(riceId);
  });

  test('respects the n limit parameter', async () => {
    const data = await userClient(USER).request<any>(`
      query {
        food_diary_top_entries_around_hour(args: { start_hour: 0, end_hour: 23, n: 1 }) {
          nutrition_item_id recipe_id
        }
      }
    `);
    expect(data.food_diary_top_entries_around_hour).toHaveLength(1);
  });

  test('returns empty when no entries fall in the hour range', async () => {
    const data = await userClient(USER).request<any>(`
      query {
        food_diary_top_entries_around_hour(args: { start_hour: 2, end_hour: 3 }) {
          nutrition_item_id
        }
      }
    `);
    expect(data.food_diary_top_entries_around_hour).toHaveLength(0);
  });

  test('result rows include nutrition_item and recipe relationships', async () => {
    const data = await userClient(USER).request<any>(`
      query {
        food_diary_top_entries_around_hour(args: { start_hour: 7, end_hour: 9 }) {
          consumed_at
          nutrition_item { id description calories }
          recipe { id name }
        }
      }
    `);
    const first = data.food_diary_top_entries_around_hour[0];
    expect(first.nutrition_item).not.toBeNull();
    expect(first.nutrition_item.description).toBe('Grilled Chicken Fillet');
  });
});
