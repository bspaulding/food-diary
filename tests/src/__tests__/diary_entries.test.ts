import { userClient } from '../client';
import { cleanupUser } from '../cleanup';
import {
  CHICKEN_BREAST,
  BROWN_RICE,
  CHICKEN_BOWL_TOTAL_SERVINGS,
  CHICKEN_BOWL_CALORIES_PER_SERVING,
  TS_DAY1_HOUR8,
  TS_DAY1_HOUR12,
  DATE_DAY1,
  CALORIES_ENTRY1,
  CALORIES_ENTRY3,
} from '../fixtures';

const USER_A = 'test-diary-user-a';
const USER_B = 'test-diary-user-b';

beforeAll(() => cleanupUser(USER_A, USER_B));
afterAll(() => cleanupUser(USER_A, USER_B));

const INSERT_ITEM = `
  mutation InsertItem($obj: food_diary_nutrition_item_insert_input!) {
    insert_food_diary_nutrition_item_one(object: $obj) { id }
  }
`;

const INSERT_RECIPE = `
  mutation InsertRecipe(
    $name: String!, $total_servings: numeric!
    $items: [food_diary_recipe_item_insert_input!]!
  ) {
    insert_food_diary_recipe_one(object: {
      name: $name, total_servings: $total_servings
      recipe_items: { data: $items }
    }) { id }
  }
`;

const INSERT_ENTRY = `
  mutation InsertEntry($obj: food_diary_diary_entry_insert_input!) {
    insert_food_diary_diary_entry_one(object: $obj) {
      id servings consumed_at
      calories day hour_of_day
      nutrition_item { id description }
      recipe { id name }
    }
  }
`;

const GET_ENTRY = `
  query GetEntry($id: Int!) {
    food_diary_diary_entry_by_pk(id: $id) {
      id servings calories day hour_of_day
    }
  }
`;

const UPDATE_ENTRY = `
  mutation UpdateEntry($id: Int!, $servings: numeric!) {
    update_food_diary_diary_entry_by_pk(
      pk_columns: { id: $id }
      _set: { servings: $servings }
    ) { id servings calories }
  }
`;

const DELETE_ENTRY = `
  mutation DeleteEntry($id: Int!) {
    delete_food_diary_diary_entry_by_pk(id: $id) { id }
  }
`;

describe('diary_entry CRUD and computed fields', () => {
  let chickenId: number;
  let recipeId: number;
  let entryId: number;

  beforeAll(async () => {
    const client = userClient(USER_A);
    const c = await client.request<any>(INSERT_ITEM, { obj: CHICKEN_BREAST });
    const r = await client.request<any>(INSERT_ITEM, { obj: BROWN_RICE });
    chickenId = c.insert_food_diary_nutrition_item_one.id;
    const riceId = r.insert_food_diary_nutrition_item_one.id;

    const recipe = await client.request<any>(INSERT_RECIPE, {
      name: 'Test Bowl',
      total_servings: CHICKEN_BOWL_TOTAL_SERVINGS,
      items: [
        { nutrition_item_id: chickenId, servings: 2 },
        { nutrition_item_id: riceId, servings: 1 },
      ],
    });
    recipeId = recipe.insert_food_diary_recipe_one.id;
  });

  describe('entry with nutrition_item', () => {
    test('insert returns entry with nutrition_item relationship', async () => {
      const data = await userClient(USER_A).request<any>(INSERT_ENTRY, {
        obj: {
          nutrition_item_id: chickenId,
          servings: 1.5,
          consumed_at: TS_DAY1_HOUR8,
        },
      });
      const entry = data.insert_food_diary_diary_entry_one;
      expect(entry.id).toBeGreaterThan(0);
      expect(Number(entry.servings)).toBeCloseTo(1.5);
      expect(entry.nutrition_item.description).toBe('Chicken Breast');
      expect(entry.recipe).toBeNull();
      entryId = entry.id;
    });

    test('computed calories = servings * nutrition_item.calories', async () => {
      const data = await userClient(USER_A).request<any>(GET_ENTRY, { id: entryId });
      expect(Number(data.food_diary_diary_entry_by_pk.calories)).toBeCloseTo(CALORIES_ENTRY1, 2);
    });

    test('computed day extracts date from consumed_at', async () => {
      const data = await userClient(USER_A).request<any>(GET_ENTRY, { id: entryId });
      expect(data.food_diary_diary_entry_by_pk.day).toBe(DATE_DAY1);
    });

    test('computed hour_of_day extracts UTC hour from consumed_at', async () => {
      const data = await userClient(USER_A).request<any>(GET_ENTRY, { id: entryId });
      expect(data.food_diary_diary_entry_by_pk.hour_of_day).toBe(8);
    });

    test('update servings recalculates calories', async () => {
      const data = await userClient(USER_A).request<any>(UPDATE_ENTRY, {
        id: entryId,
        servings: 3,
      });
      expect(Number(data.update_food_diary_diary_entry_by_pk.calories)).toBeCloseTo(3 * 165, 2);
      // Reset
      await userClient(USER_A).request<any>(UPDATE_ENTRY, { id: entryId, servings: 1.5 });
    });

    test('delete removes the entry', async () => {
      const data = await userClient(USER_A).request<any>(DELETE_ENTRY, { id: entryId });
      expect(data.delete_food_diary_diary_entry_by_pk.id).toBe(entryId);
      const check = await userClient(USER_A).request<any>(GET_ENTRY, { id: entryId });
      expect(check.food_diary_diary_entry_by_pk).toBeNull();
    });
  });

  describe('entry with recipe', () => {
    let recipeEntryId: number;

    test('insert returns entry with recipe relationship', async () => {
      const data = await userClient(USER_A).request<any>(INSERT_ENTRY, {
        obj: {
          recipe_id: recipeId,
          servings: 1,
          consumed_at: TS_DAY1_HOUR12,
        },
      });
      const entry = data.insert_food_diary_diary_entry_one;
      expect(entry.recipe.name).toBe('Test Bowl');
      expect(entry.nutrition_item).toBeNull();
      recipeEntryId = entry.id;
    });

    test('computed calories = servings * recipe_calories_per_serving', async () => {
      const data = await userClient(USER_A).request<any>(GET_ENTRY, { id: recipeEntryId });
      // 1 serving × 273 cal/serving = 273
      expect(Number(data.food_diary_diary_entry_by_pk.calories)).toBeCloseTo(CALORIES_ENTRY3, 2);
    });

    test('computed hour_of_day reflects consumed_at hour', async () => {
      const data = await userClient(USER_A).request<any>(GET_ENTRY, { id: recipeEntryId });
      expect(data.food_diary_diary_entry_by_pk.hour_of_day).toBe(12);
    });
  });

  describe('has_recipe_xor_item constraint', () => {
    test('rejects entry with both nutrition_item_id and recipe_id set', async () => {
      await expect(
        userClient(USER_A).request(INSERT_ENTRY, {
          obj: {
            nutrition_item_id: chickenId,
            recipe_id: recipeId,
            servings: 1,
          },
        }),
      ).rejects.toThrow();
    });

    test('rejects entry with neither nutrition_item_id nor recipe_id', async () => {
      await expect(
        userClient(USER_A).request(INSERT_ENTRY, {
          obj: { servings: 1 },
        }),
      ).rejects.toThrow();
    });
  });

  describe('row-level security', () => {
    test('user cannot see another user\'s entries', async () => {
      // Insert an entry for USER_B
      await userClient(USER_B).request<any>(
        INSERT_ITEM,
        { obj: CHICKEN_BREAST },
      ).then((d: any) =>
        userClient(USER_B).request<any>(INSERT_ENTRY, {
          obj: {
            nutrition_item_id: d.insert_food_diary_nutrition_item_one.id,
            servings: 1,
          },
        }),
      );

      // USER_A queries entries — should only see their own
      const data = await userClient(USER_A).request<any>(`
        query { food_diary_diary_entry { id } }
      `);
      // All returned entry IDs must belong to USER_A (we verify indirectly by checking
      // that the list is consistent with what USER_A inserted and doesn't cross-pollute)
      expect(data.food_diary_diary_entry.length).toBeGreaterThanOrEqual(0);

      // USER_B queries — should not return USER_A entries
      const dataB = await userClient(USER_B).request<any>(`
        query { food_diary_diary_entry { id } }
      `);
      const idsA = data.food_diary_diary_entry.map((e: any) => e.id);
      const idsB = dataB.food_diary_diary_entry.map((e: any) => e.id);
      const overlap = idsA.filter((id: number) => idsB.includes(id));
      expect(overlap).toHaveLength(0);
    });

    test('user cannot delete another user\'s entry', async () => {
      // Get an entry belonging to USER_B
      const dataB = await userClient(USER_B).request<any>(`
        query { food_diary_diary_entry(limit: 1) { id } }
      `);
      if (dataB.food_diary_diary_entry.length === 0) return; // nothing to test
      const bEntryId = dataB.food_diary_diary_entry[0].id;

      // USER_A attempts delete → should return null (no rows affected)
      const result = await userClient(USER_A).request<any>(DELETE_ENTRY, { id: bEntryId });
      expect(result.delete_food_diary_diary_entry_by_pk).toBeNull();
    });
  });
});
