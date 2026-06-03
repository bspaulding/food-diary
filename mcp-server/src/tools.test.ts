import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { sign } from "jsonwebtoken";
import {
  listDiaryEntries,
  searchFood,
  createDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  createNutritionItem,
  updateNutritionItem,
  createRecipe,
  updateRecipe,
} from "./tools.js";

const HASURA_URL = "https://direct-satyr-14.hasura.app/v1/graphql";
const JWT = sign({ sub: "user-123" }, "test-key", {
  audience: HASURA_URL,
  expiresIn: "1h",
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function hasuraOk(data: unknown) {
  return http.post(HASURA_URL, () => HttpResponse.json({ data }));
}

describe("listDiaryEntries", () => {
  it("calls Hasura with date range and returns JSON text", async () => {
    const entries = [{ id: 1, consumed_at: "2024-01-15T08:00:00Z", servings: 1, calories: 300 }];
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: { food_diary_diary_entry: entries } });
      })
    );

    const result = await listDiaryEntries(JWT, {
      start_date: "2024-01-01T00:00:00Z",
      end_date: "2024-01-31T23:59:59Z",
    });

    expect(captured).toMatchObject({
      variables: { start_date: "2024-01-01T00:00:00Z", end_date: "2024-01-31T23:59:59Z" },
    });
    expect(result.content[0].text).toContain('"id": 1');
  });
});

describe("searchFood", () => {
  it("calls Hasura with search term and returns JSON text", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          data: {
            food_diary_search_nutrition_items: [{ id: 5, description: "Oatmeal", calories: 150 }],
            food_diary_search_recipes: [],
          },
        });
      })
    );

    const result = await searchFood(JWT, { query: "oat" });

    expect(captured).toMatchObject({ variables: { search: "oat" } });
    expect(result.content[0].text).toContain("Oatmeal");
  });
});

describe("createDiaryEntry", () => {
  it("sends nutrition_item_id when provided", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: { insert_food_diary_diary_entry_one: { id: 42 } } });
      })
    );

    const result = await createDiaryEntry(JWT, {
      consumed_at: "2024-01-15T08:00:00Z",
      servings: 1.5,
      nutrition_item_id: 7,
    });

    expect(captured).toMatchObject({
      variables: { entry: { consumed_at: "2024-01-15T08:00:00Z", servings: 1.5, nutrition_item_id: 7 } },
    });
    expect(result.content[0].text).toBe("Created diary entry with id: 42");
  });

  it("sends recipe_id when provided (and omits nutrition_item_id)", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: { insert_food_diary_diary_entry_one: { id: 99 } } });
      })
    );

    await createDiaryEntry(JWT, { consumed_at: "2024-01-15T12:00:00Z", servings: 2, recipe_id: 3 });

    expect(captured).toMatchObject({ variables: { entry: { recipe_id: 3 } } });
    expect((captured as { variables: { entry: Record<string, unknown> } }).variables.entry).not.toHaveProperty(
      "nutrition_item_id"
    );
  });
});

describe("updateDiaryEntry", () => {
  it("sends only servings when consumed_at is omitted", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: { update_food_diary_diary_entry_by_pk: { id: 10 } } });
      })
    );

    const result = await updateDiaryEntry(JWT, { id: 10, servings: 2 });

    expect(captured).toMatchObject({ variables: { id: 10, attrs: { servings: 2 } } });
    expect(
      (captured as { variables: { attrs: Record<string, unknown> } }).variables.attrs
    ).not.toHaveProperty("consumed_at");
    expect(result.content[0].text).toBe("Updated diary entry 10");
  });

  it("sends only consumed_at when servings is omitted", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: { update_food_diary_diary_entry_by_pk: { id: 10 } } });
      })
    );

    await updateDiaryEntry(JWT, { id: 10, consumed_at: "2024-02-01T09:00:00Z" });

    expect(captured).toMatchObject({
      variables: { id: 10, attrs: { consumed_at: "2024-02-01T09:00:00Z" } },
    });
    expect(
      (captured as { variables: { attrs: Record<string, unknown> } }).variables.attrs
    ).not.toHaveProperty("servings");
  });
});

describe("deleteDiaryEntry", () => {
  it("calls the delete mutation and returns confirmation text", async () => {
    server.use(hasuraOk({ delete_food_diary_diary_entry_by_pk: { id: 5 } }));

    const result = await deleteDiaryEntry(JWT, { id: 5 });

    expect(result.content[0].text).toBe("Deleted diary entry 5");
  });
});

describe("createNutritionItem", () => {
  it("passes all macro fields and returns the new item description and id", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          data: { insert_food_diary_nutrition_item_one: { id: 20, description: "Granola" } },
        });
      })
    );

    const args = {
      description: "Granola",
      calories: 400,
      total_fat_grams: 10,
      saturated_fat_grams: 2,
      trans_fat_grams: 0,
      polyunsaturated_fat_grams: 3,
      monounsaturated_fat_grams: 4,
      cholesterol_milligrams: 0,
      sodium_milligrams: 50,
      total_carbohydrate_grams: 60,
      dietary_fiber_grams: 5,
      total_sugars_grams: 15,
      added_sugars_grams: 8,
      protein_grams: 9,
    };
    const result = await createNutritionItem(JWT, args);

    expect(captured).toMatchObject({ variables: { item: args } });
    expect(result.content[0].text).toBe("Created nutrition item 'Granola' with id: 20");
  });
});

describe("updateNutritionItem", () => {
  it("sends only defined fields in attrs and filters out undefined ones", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ data: { update_food_diary_nutrition_item_by_pk: { id: 3 } } });
      })
    );

    const result = await updateNutritionItem(JWT, { id: 3, description: "Updated Oatmeal", calories: 180 });

    const attrs = (captured as { variables: { attrs: Record<string, unknown> } }).variables.attrs;
    expect(attrs).toEqual({ description: "Updated Oatmeal", calories: 180 });
    expect(attrs).not.toHaveProperty("protein_grams");
    expect(result.content[0].text).toBe("Updated nutrition item 3");
  });
});

describe("createRecipe", () => {
  it("transforms items into the nested data format and returns confirmation", async () => {
    let captured: unknown;
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          data: { insert_food_diary_recipe_one: { id: 11, name: "Trail Mix" } },
        });
      })
    );

    const result = await createRecipe(JWT, {
      name: "Trail Mix",
      total_servings: 6,
      items: [
        { nutrition_item_id: 1, servings: 2 },
        { nutrition_item_id: 2, servings: 1 },
      ],
    });

    expect(captured).toMatchObject({
      variables: {
        input: {
          name: "Trail Mix",
          total_servings: 6,
          recipe_items: { data: [{ nutrition_item_id: 1, servings: 2 }, { nutrition_item_id: 2, servings: 1 }] },
        },
      },
    });
    expect(result.content[0].text).toBe("Created recipe 'Trail Mix' with id: 11");
  });
});

describe("updateRecipe", () => {
  it("uses the full mutation (delete + insert items) when items are provided", async () => {
    let capturedQuery = "";
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        const body = (await request.json()) as { query: string; variables: unknown };
        capturedQuery = body.query;
        return HttpResponse.json({ data: { update_food_diary_recipe_by_pk: { id: 8 } } });
      })
    );

    const result = await updateRecipe(JWT, {
      id: 8,
      name: "Updated Mix",
      items: [{ nutrition_item_id: 3, servings: 2 }],
    });

    expect(capturedQuery).toContain("delete_food_diary_recipe_item");
    expect(capturedQuery).toContain("insert_food_diary_recipe_item");
    expect(result.content[0].text).toBe("Updated recipe 8");
  });

  it("uses the attrs-only mutation when items are not provided", async () => {
    let capturedQuery = "";
    server.use(
      http.post(HASURA_URL, async ({ request }) => {
        const body = (await request.json()) as { query: string };
        capturedQuery = body.query;
        return HttpResponse.json({ data: { update_food_diary_recipe_by_pk: { id: 8 } } });
      })
    );

    const result = await updateRecipe(JWT, { id: 8, total_servings: 4 });

    expect(capturedQuery).not.toContain("delete_food_diary_recipe_item");
    expect(result.content[0].text).toBe("Updated recipe 8");
  });
});
