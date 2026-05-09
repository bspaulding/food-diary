import { userClient } from '../client';
import { cleanupUser } from '../cleanup';
import {
  CHICKEN_BREAST,
  BROWN_RICE,
  CHICKEN_BOWL_TOTAL_SERVINGS,
  CHICKEN_BOWL_CALORIES_PER_SERVING,
} from '../fixtures';

const USER_A = 'test-recipes-user-a';
const USER_B = 'test-recipes-user-b';

beforeAll(() => cleanupUser(USER_A, USER_B));
afterAll(() => cleanupUser(USER_A, USER_B));

const INSERT_ITEM = `
  mutation InsertItem($obj: food_diary_nutrition_item_insert_input!) {
    insert_food_diary_nutrition_item_one(object: $obj) { id }
  }
`;

const INSERT_RECIPE = `
  mutation InsertRecipe(
    $name: String!
    $total_servings: numeric!
    $items: [food_diary_recipe_item_insert_input!]!
  ) {
    insert_food_diary_recipe_one(object: {
      name: $name
      total_servings: $total_servings
      recipe_items: { data: $items }
    }) {
      id name total_servings calories
      recipe_items {
        servings
        nutrition_item { id description calories }
      }
    }
  }
`;

const GET_RECIPE = `
  query GetRecipe($id: Int!) {
    food_diary_recipe_by_pk(id: $id) { id name total_servings calories }
  }
`;

const LIST_RECIPES = `
  query {
    food_diary_recipe(order_by: { id: asc }) { id name calories }
  }
`;

const UPDATE_RECIPE = `
  mutation UpdateRecipe($id: Int!, $name: String!) {
    update_food_diary_recipe_by_pk(
      pk_columns: { id: $id }
      _set: { name: $name }
    ) { id name }
  }
`;

const DELETE_RECIPE_ITEMS = `
  mutation DeleteRecipeItems($recipe_id: Int!) {
    delete_food_diary_recipe_item(where: { recipe_id: { _eq: $recipe_id } }) {
      affected_rows
    }
  }
`;

const DELETE_RECIPE = `
  mutation DeleteRecipe($id: Int!) {
    delete_food_diary_recipe_by_pk(id: $id) { id }
  }
`;

describe('recipe CRUD and computed calories', () => {
  let chickenId: number;
  let riceId: number;
  let recipeId: number;

  beforeAll(async () => {
    const client = userClient(USER_A);
    const c = await client.request<any>(INSERT_ITEM, { obj: CHICKEN_BREAST });
    const r = await client.request<any>(INSERT_ITEM, { obj: BROWN_RICE });
    chickenId = c.insert_food_diary_nutrition_item_one.id;
    riceId = r.insert_food_diary_nutrition_item_one.id;
  });

  test('insert recipe with items returns recipe with nested items', async () => {
    const client = userClient(USER_A);
    const data = await client.request<any>(INSERT_RECIPE, {
      name: 'Chicken Bowl',
      total_servings: CHICKEN_BOWL_TOTAL_SERVINGS,
      items: [
        { nutrition_item_id: chickenId, servings: 2 },
        { nutrition_item_id: riceId, servings: 1 },
      ],
    });
    const recipe = data.insert_food_diary_recipe_one;
    expect(recipe.name).toBe('Chicken Bowl');
    expect(Number(recipe.total_servings)).toBe(CHICKEN_BOWL_TOTAL_SERVINGS);
    expect(recipe.recipe_items).toHaveLength(2);
    recipeId = recipe.id;
  });

  test('computed calories = sum(ri.servings * ni.calories) / total_servings', async () => {
    // (2 * 165 + 1 * 216) / 2 = 273
    const data = await userClient(USER_A).request<any>(GET_RECIPE, { id: recipeId });
    const calories = Number(data.food_diary_recipe_by_pk.calories);
    expect(calories).toBeCloseTo(CHICKEN_BOWL_CALORIES_PER_SERVING, 2);
  });

  test('list returns only the current user\'s recipes', async () => {
    // Create a recipe for USER_B
    const niB = await userClient(USER_B).request<any>(INSERT_ITEM, { obj: CHICKEN_BREAST });
    await userClient(USER_B).request<any>(INSERT_RECIPE, {
      name: 'B Special',
      total_servings: 1,
      items: [{ nutrition_item_id: niB.insert_food_diary_nutrition_item_one.id, servings: 1 }],
    });

    const dataA = await userClient(USER_A).request<any>(LIST_RECIPES);
    const dataBResult = await userClient(USER_B).request<any>(LIST_RECIPES);

    const namesA = dataA.food_diary_recipe.map((r: any) => r.name);
    const namesB = dataBResult.food_diary_recipe.map((r: any) => r.name);

    expect(namesA).toContain('Chicken Bowl');
    expect(namesA).not.toContain('B Special');

    expect(namesB).toContain('B Special');
    expect(namesB).not.toContain('Chicken Bowl');
  });

  test('calories changes when total_servings is updated', async () => {
    // Double the servings → calories per serving should halve
    await userClient(USER_A).request<any>(
      `mutation { update_food_diary_recipe_by_pk(
          pk_columns: { id: ${recipeId} }
          _set: { total_servings: 4 }
        ) { id } }`,
    );
    const data = await userClient(USER_A).request<any>(GET_RECIPE, { id: recipeId });
    expect(Number(data.food_diary_recipe_by_pk.calories)).toBeCloseTo(
      CHICKEN_BOWL_CALORIES_PER_SERVING / 2,
      2,
    );
    // Reset to original servings
    await userClient(USER_A).request<any>(
      `mutation { update_food_diary_recipe_by_pk(
          pk_columns: { id: ${recipeId} }
          _set: { total_servings: ${CHICKEN_BOWL_TOTAL_SERVINGS} }
        ) { id } }`,
    );
  });

  test('update name', async () => {
    const data = await userClient(USER_A).request<any>(UPDATE_RECIPE, {
      id: recipeId,
      name: 'Updated Bowl',
    });
    expect(data.update_food_diary_recipe_by_pk.name).toBe('Updated Bowl');
  });

  test('update is rejected for another user\'s recipe', async () => {
    const data = await userClient(USER_B).request<any>(UPDATE_RECIPE, {
      id: recipeId,
      name: 'Hacked',
    });
    expect(data.update_food_diary_recipe_by_pk).toBeNull();
  });

  test('delete removes the recipe', async () => {
    // Must remove recipe_items before deleting the recipe (FK constraint)
    await userClient(USER_A).request<any>(DELETE_RECIPE_ITEMS, { recipe_id: recipeId });
    const data = await userClient(USER_A).request<any>(DELETE_RECIPE, { id: recipeId });
    expect(data.delete_food_diary_recipe_by_pk.id).toBe(recipeId);

    const check = await userClient(USER_A).request<any>(GET_RECIPE, { id: recipeId });
    expect(check.food_diary_recipe_by_pk).toBeNull();
  });
});
