/**
 * Tests for all Hasura views:
 *   - food_diary_diary_entry_recent
 *   - food_diary_recently_logged_items
 *   - food_diary_calories_per_day
 *   - food_diary_most_logged_entries
 *   - food_diary_trends_weekly
 *
 * Test data (USER_A, ISO week 3 of 2024):
 *   entry1: chicken breast × 1.5,  2024-01-15 08:00 UTC → calories 247.5
 *   entry2: brown rice    × 1,     2024-01-15 12:00 UTC → calories 216
 *   entry3: recipe        × 1,     2024-01-15 18:00 UTC → calories 273
 *   entry4: chicken breast × 2,    2024-01-16 08:00 UTC → calories 330
 */
import { userClient } from '../client';
import { cleanupUser } from '../cleanup';
import {
  CHICKEN_BREAST,
  BROWN_RICE,
  CHICKEN_BOWL_TOTAL_SERVINGS,
  TS_DAY1_HOUR8,
  TS_DAY1_HOUR12,
  TS_DAY1_HOUR18,
  TS_DAY2_HOUR8,
  DATE_DAY1,
  DATE_DAY2,
  CALORIES_DAY1,
  CALORIES_DAY2,
  WEEKLY_AVG_CALORIES,
  WEEKLY_AVG_PROTEIN,
} from '../fixtures';

const USER_A = 'test-views-user-a';
const USER_B = 'test-views-user-b';

let chickenId: number;
let riceId: number;
let recipeId: number;

beforeAll(async () => {
  await cleanupUser(USER_A, USER_B);

  const client = userClient(USER_A);

  const c = await client.request<any>(`
    mutation { insert_food_diary_nutrition_item_one(object: ${objStr(CHICKEN_BREAST)}) { id } }
  `);
  chickenId = c.insert_food_diary_nutrition_item_one.id;

  const r = await client.request<any>(`
    mutation { insert_food_diary_nutrition_item_one(object: ${objStr(BROWN_RICE)}) { id } }
  `);
  riceId = r.insert_food_diary_nutrition_item_one.id;

  const recipe = await client.request<any>(`
    mutation {
      insert_food_diary_recipe_one(object: {
        name: "Chicken Bowl"
        total_servings: ${CHICKEN_BOWL_TOTAL_SERVINGS}
        recipe_items: { data: [
          { nutrition_item_id: ${chickenId}, servings: 2 }
          { nutrition_item_id: ${riceId}, servings: 1 }
        ]}
      }) { id }
    }
  `);
  recipeId = recipe.insert_food_diary_recipe_one.id;

  // Insert 4 diary entries
  await client.request(`
    mutation {
      e1: insert_food_diary_diary_entry_one(object: {
        nutrition_item_id: ${chickenId}, servings: 1.5, consumed_at: "${TS_DAY1_HOUR8}"
      }) { id }
      e2: insert_food_diary_diary_entry_one(object: {
        nutrition_item_id: ${riceId}, servings: 1, consumed_at: "${TS_DAY1_HOUR12}"
      }) { id }
      e3: insert_food_diary_diary_entry_one(object: {
        recipe_id: ${recipeId}, servings: 1, consumed_at: "${TS_DAY1_HOUR18}"
      }) { id }
      e4: insert_food_diary_diary_entry_one(object: {
        nutrition_item_id: ${chickenId}, servings: 2, consumed_at: "${TS_DAY2_HOUR8}"
      }) { id }
    }
  `);

  // Insert one entry for USER_B to verify row isolation in views
  const niB = await userClient(USER_B).request<any>(`
    mutation { insert_food_diary_nutrition_item_one(object: ${objStr(CHICKEN_BREAST)}) { id } }
  `);
  await userClient(USER_B).request(`
    mutation {
      insert_food_diary_diary_entry_one(object: {
        nutrition_item_id: ${niB.insert_food_diary_nutrition_item_one.id}
        servings: 1, consumed_at: "${TS_DAY1_HOUR8}"
      }) { id }
    }
  `);
});

afterAll(() => cleanupUser(USER_A, USER_B));

// Helper: convert a plain object to a GraphQL inline argument string
function objStr(obj: Record<string, unknown>): string {
  const fields = Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
    .join(', ');
  return `{ ${fields} }`;
}

// ─────────────────────────────────────────────
// diary_entry_recent
// ─────────────────────────────────────────────
describe('food_diary_diary_entry_recent view', () => {
  test('returns all entries for the current user', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_diary_entry_recent {
          id servings nutrition_item_id recipe_id
        }
      }
    `);
    expect(data.food_diary_diary_entry_recent).toHaveLength(4);
  });

  test('does not return another user\'s entries', async () => {
    const dataA = await userClient(USER_A).request<any>(`
      query { food_diary_diary_entry_recent { id } }
    `);
    const dataB = await userClient(USER_B).request<any>(`
      query { food_diary_diary_entry_recent { id } }
    `);
    const idsA = dataA.food_diary_diary_entry_recent.map((e: any) => e.id);
    const idsB = dataB.food_diary_diary_entry_recent.map((e: any) => e.id);
    const overlap = idsA.filter((id: number) => idsB.includes(id));
    expect(overlap).toHaveLength(0);
  });

  test('entries are ordered by proximity of hour to current hour (no exact-order assertion)', async () => {
    // The view orders by abs(date_part('hour', now()) - date_part('hour', consumed_at)).
    // We verify the invariant: for any consecutive pair, the abs-hour-diff is non-decreasing.
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_diary_entry_recent { consumed_at }
      }
    `);
    const entries = data.food_diary_diary_entry_recent;
    const nowHour = new Date().getUTCHours();
    const diffs = entries.map((e: any) => {
      const h = new Date(e.consumed_at).getUTCHours();
      return Math.abs(nowHour - h);
    });
    for (let i = 1; i < diffs.length; i++) {
      expect(diffs[i]).toBeGreaterThanOrEqual(diffs[i - 1]);
    }
  });

  test('supports relationship traversal to nutrition_item', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_diary_entry_recent(
          where: { nutrition_item_id: { _is_null: false } }
          limit: 1
        ) {
          nutrition_item { description }
        }
      }
    `);
    expect(data.food_diary_diary_entry_recent[0].nutrition_item.description).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
// recently_logged_items
// ─────────────────────────────────────────────
describe('food_diary_recently_logged_items view', () => {
  test('returns distinct (nutrition_item_id, recipe_id) combinations', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_recently_logged_items {
          nutrition_item_id recipe_id
        }
      }
    `);
    // chicken breast (logged twice) → 1 distinct row
    // brown rice (1 time)            → 1 distinct row
    // recipe (1 time)                → 1 distinct row
    expect(data.food_diary_recently_logged_items).toHaveLength(3);
  });

  test('user_id isolation: USER_B sees only their own items', async () => {
    const dataB = await userClient(USER_B).request<any>(`
      query { food_diary_recently_logged_items { nutrition_item_id recipe_id } }
    `);
    // USER_B has one entry with a distinct nutrition_item
    expect(dataB.food_diary_recently_logged_items).toHaveLength(1);
  });

  test('supports relationship to nutrition_item', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_recently_logged_items(
          where: { nutrition_item_id: { _is_null: false } }
        ) {
          nutrition_item { description calories }
        }
      }
    `);
    const descriptions = data.food_diary_recently_logged_items.map(
      (r: any) => r.nutrition_item.description,
    );
    expect(descriptions).toContain('Chicken Breast');
    expect(descriptions).toContain('Brown Rice');
  });

  test('supports relationship to recipe', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_recently_logged_items(
          where: { recipe_id: { _is_null: false } }
        ) {
          recipe { name }
        }
      }
    `);
    expect(data.food_diary_recently_logged_items[0].recipe.name).toBe('Chicken Bowl');
  });
});

// ─────────────────────────────────────────────
// calories_per_day
// ─────────────────────────────────────────────
describe('food_diary_calories_per_day view', () => {
  test('aggregates calories by day', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_calories_per_day(order_by: { day: asc }) {
          day sum
        }
      }
    `);
    expect(data.food_diary_calories_per_day).toHaveLength(2);

    const [day1, day2] = data.food_diary_calories_per_day;
    expect(day1.day).toBe(DATE_DAY1);
    expect(Number(day1.sum)).toBeCloseTo(CALORIES_DAY1, 2);

    expect(day2.day).toBe(DATE_DAY2);
    expect(Number(day2.sum)).toBeCloseTo(CALORIES_DAY2, 2);
  });

  test('is user-scoped: USER_B sees only their own data', async () => {
    const data = await userClient(USER_B).request<any>(`
      query { food_diary_calories_per_day { day sum } }
    `);
    expect(data.food_diary_calories_per_day).toHaveLength(1);
    expect(Number(data.food_diary_calories_per_day[0].sum)).toBeCloseTo(165, 2);
  });

  test('supports aggregation queries', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_calories_per_day_aggregate {
          aggregate { count sum { sum } }
        }
      }
    `);
    expect(data.food_diary_calories_per_day_aggregate.aggregate.count).toBe(2);
    expect(Number(data.food_diary_calories_per_day_aggregate.aggregate.sum.sum)).toBeCloseTo(
      CALORIES_DAY1 + CALORIES_DAY2,
      2,
    );
  });
});

// ─────────────────────────────────────────────
// most_logged_entries
// ─────────────────────────────────────────────
describe('food_diary_most_logged_entries view', () => {
  test('counts each (nutrition_item_id, recipe_id) pair', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_most_logged_entries(order_by: { times_logged: desc }) {
          nutrition_item_id recipe_id times_logged
        }
      }
    `);
    expect(data.food_diary_most_logged_entries).toHaveLength(3);

    // Chicken breast was logged twice
    const top = data.food_diary_most_logged_entries[0];
    expect(top.nutrition_item_id).toBe(chickenId);
    expect(top.recipe_id).toBeNull();
    expect(Number(top.times_logged)).toBe(2);
  });

  test('is user-scoped', async () => {
    const data = await userClient(USER_B).request<any>(`
      query { food_diary_most_logged_entries { nutrition_item_id times_logged } }
    `);
    expect(data.food_diary_most_logged_entries).toHaveLength(1);
    expect(Number(data.food_diary_most_logged_entries[0].times_logged)).toBe(1);
  });

  test('supports relationship to nutrition_item', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_most_logged_entries(
          where: { nutrition_item_id: { _eq: ${chickenId} } }
        ) {
          times_logged
          nutrition_item { description calories }
        }
      }
    `);
    expect(data.food_diary_most_logged_entries[0].nutrition_item.description).toBe('Chicken Breast');
  });

  test('supports relationship to recipe', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_most_logged_entries(
          where: { recipe_id: { _is_null: false } }
        ) {
          times_logged
          recipe { name }
        }
      }
    `);
    expect(data.food_diary_most_logged_entries[0].recipe.name).toBe('Chicken Bowl');
  });
});

// ─────────────────────────────────────────────
// trends_weekly
// ─────────────────────────────────────────────
describe('food_diary_trends_weekly view', () => {
  test('returns one row per (user, week)', async () => {
    const data = await userClient(USER_A).request<any>(`
      query { food_diary_trends_weekly { week_of_year calories protein added_sugar } }
    `);
    // All 4 entries fall in ISO week 3 of 2024
    expect(data.food_diary_trends_weekly).toHaveLength(1);
    expect(data.food_diary_trends_weekly[0].week_of_year).toBe(3);
  });

  test('calories is the average diary_entry_calories for the week', async () => {
    const data = await userClient(USER_A).request<any>(`
      query { food_diary_trends_weekly { calories } }
    `);
    expect(data.food_diary_trends_weekly[0].calories).toBeCloseTo(WEEKLY_AVG_CALORIES, 2);
  });

  test('protein is the average diary_entry_protein for the week', async () => {
    // recipe_protein divides by total_servings (= 33.5/serving), matching recipe_calories behaviour.
    const data = await userClient(USER_A).request<any>(`
      query { food_diary_trends_weekly { protein } }
    `);
    expect(data.food_diary_trends_weekly[0].protein).toBeCloseTo(WEEKLY_AVG_PROTEIN, 2);
  });

  test('added_sugar is the average diary_entry_added_sugar for the week', async () => {
    // All test items have 0 added sugars
    const data = await userClient(USER_A).request<any>(`
      query { food_diary_trends_weekly { added_sugar } }
    `);
    expect(data.food_diary_trends_weekly[0].added_sugar).toBeCloseTo(0, 5);
  });

  test('is user-scoped', async () => {
    const dataA = await userClient(USER_A).request<any>(`
      query { food_diary_trends_weekly { week_of_year calories } }
    `);
    const dataB = await userClient(USER_B).request<any>(`
      query { food_diary_trends_weekly { week_of_year calories } }
    `);
    // Users have different calorie averages; rows are independent
    expect(Number(dataA.food_diary_trends_weekly[0].calories)).not.toBeCloseTo(
      Number(dataB.food_diary_trends_weekly[0].calories),
      0,
    );
  });

  test('supports aggregation', async () => {
    const data = await userClient(USER_A).request<any>(`
      query {
        food_diary_trends_weekly_aggregate {
          aggregate { count }
        }
      }
    `);
    expect(data.food_diary_trends_weekly_aggregate.aggregate.count).toBe(1);
  });
});
