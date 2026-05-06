import { adminClient, userClient } from '../client';
import { cleanupUser } from '../cleanup';
import { CHICKEN_BREAST, BROWN_RICE } from '../fixtures';

const USER_A = 'test-nutrition-user-a';
const USER_B = 'test-nutrition-user-b';

beforeAll(() => cleanupUser(USER_A, USER_B));
afterAll(() => cleanupUser(USER_A, USER_B));

const INSERT_ITEM = `
  mutation InsertItem($obj: food_diary_nutrition_item_insert_input!) {
    insert_food_diary_nutrition_item_one(object: $obj) {
      id description calories protein_grams added_sugars_grams
    }
  }
`;

const LIST_ITEMS = `
  query {
    food_diary_nutrition_item(order_by: { id: asc }) {
      id description calories
    }
  }
`;

const GET_ITEM = `
  query GetItem($id: Int!) {
    food_diary_nutrition_item_by_pk(id: $id) {
      id description calories protein_grams
    }
  }
`;

const UPDATE_ITEM = `
  mutation UpdateItem($id: Int!, $desc: String!) {
    update_food_diary_nutrition_item_by_pk(
      pk_columns: { id: $id }
      _set: { description: $desc }
    ) { id description }
  }
`;

const DELETE_ITEM = `
  mutation DeleteItem($id: Int!) {
    delete_food_diary_nutrition_item_by_pk(id: $id) { id }
  }
`;

describe('nutrition_item CRUD', () => {
  let itemId: number;

  test('insert returns the new item', async () => {
    const client = userClient(USER_A);
    const data = await client.request<any>(INSERT_ITEM, { obj: CHICKEN_BREAST });
    const item = data.insert_food_diary_nutrition_item_one;
    expect(item.id).toBeGreaterThan(0);
    expect(item.description).toBe('Chicken Breast');
    expect(item.calories).toBe(165);
    expect(Number(item.protein_grams)).toBeCloseTo(31);
    expect(Number(item.added_sugars_grams)).toBeCloseTo(0);
    itemId = item.id;
  });

  test('list returns only the current user\'s items', async () => {
    // Insert an item for USER_B
    await userClient(USER_B).request<any>(INSERT_ITEM, { obj: BROWN_RICE });

    const dataA = await userClient(USER_A).request<any>(LIST_ITEMS);
    const dataB = await userClient(USER_B).request<any>(LIST_ITEMS);

    const idsA = dataA.food_diary_nutrition_item.map((i: any) => i.description);
    const idsB = dataB.food_diary_nutrition_item.map((i: any) => i.description);

    expect(idsA).toContain('Chicken Breast');
    expect(idsA).not.toContain('Brown Rice');

    expect(idsB).toContain('Brown Rice');
    expect(idsB).not.toContain('Chicken Breast');
  });

  test('fetch by pk returns the item', async () => {
    const data = await userClient(USER_A).request<any>(GET_ITEM, { id: itemId });
    expect(data.food_diary_nutrition_item_by_pk.id).toBe(itemId);
    expect(data.food_diary_nutrition_item_by_pk.description).toBe('Chicken Breast');
  });

  test('update changes the description', async () => {
    const data = await userClient(USER_A).request<any>(UPDATE_ITEM, {
      id: itemId,
      desc: 'Grilled Chicken Breast',
    });
    expect(data.update_food_diary_nutrition_item_by_pk.description).toBe('Grilled Chicken Breast');
  });

  test('update is rejected for a different user\'s item', async () => {
    // USER_B tries to update USER_A's item — should fail or return null (no rows match)
    const data = await userClient(USER_B).request<any>(UPDATE_ITEM, {
      id: itemId,
      desc: 'Hacked',
    });
    expect(data.update_food_diary_nutrition_item_by_pk).toBeNull();
  });

  test('delete removes the item', async () => {
    const data = await userClient(USER_A).request<any>(DELETE_ITEM, { id: itemId });
    expect(data.delete_food_diary_nutrition_item_by_pk.id).toBe(itemId);

    const check = await userClient(USER_A).request<any>(GET_ITEM, { id: itemId });
    expect(check.food_diary_nutrition_item_by_pk).toBeNull();
  });

  test('delete is rejected for a different user\'s item', async () => {
    // Insert an item for USER_B then try to delete as USER_A
    const inserted = await userClient(USER_B).request<any>(INSERT_ITEM, { obj: CHICKEN_BREAST });
    const bItemId = inserted.insert_food_diary_nutrition_item_one.id;

    const data = await userClient(USER_A).request<any>(DELETE_ITEM, { id: bItemId });
    expect(data.delete_food_diary_nutrition_item_by_pk).toBeNull();

    // Confirm item still exists for USER_B
    const check = await userClient(USER_B).request<any>(GET_ITEM, { id: bItemId });
    expect(check.food_diary_nutrition_item_by_pk).not.toBeNull();
  });

  test('admin can see all items regardless of user', async () => {
    const data = await adminClient().request<any>(LIST_ITEMS);
    const descriptions = data.food_diary_nutrition_item.map((i: any) => i.description);
    // Both user A and B items should be visible
    expect(descriptions.length).toBeGreaterThanOrEqual(2);
  });
});
