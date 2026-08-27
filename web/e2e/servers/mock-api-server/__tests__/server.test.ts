import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signHs256Jwt } from "../../shared/jwt.ts";
import { ACCESS_TOKEN_SECRET } from "../../shared/secrets.ts";
import { createMockApiServer } from "../server.ts";
import { MockApiStore } from "../store.ts";

const SUB = "e2e|test-user";

function mintAccessToken(
  overrides: { sub?: string; expiresInSeconds?: number } = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresInSeconds = overrides.expiresInSeconds ?? 3600;
  return signHs256Jwt(
    { sub: overrides.sub ?? SUB, iat: now, exp: now + expiresInSeconds },
    ACCESS_TOKEN_SECRET,
  );
}

/** One `as` cast, isolated here, so every call site gets a precisely-typed
 * result without introducing `any` anywhere else in this file. */
function dataOf<T>(body: unknown): T {
  return (body as { data: T }).data;
}

function errorsOf(body: unknown): Array<{ message: string }> {
  return (body as { errors: Array<{ message: string }> }).errors;
}

type IdResult = { id: number };
type AffectedRows = { affected_rows: number };

type NutritionItemCamel = {
  id: number;
  description: string;
  calories: number;
  totalFatGrams: number;
};

type ExpandedNutritionItem = {
  id: number;
  description: string;
  calories: number;
};

type ExpandedRecipe = {
  id: number;
  name: string;
  calories: number;
  total_servings: number;
  recipe_items: Array<{
    servings: number;
    nutrition_item: ExpandedNutritionItem;
  }>;
};

type ExpandedDiaryEntry = {
  id: number;
  consumed_at: string;
  servings: number;
  calories: number;
  nutrition_item: ExpandedNutritionItem | null;
  recipe: ExpandedRecipe | null;
};

type SuggestionEntry = {
  consumed_at: string;
  nutrition_item: { id: number; description: string } | null;
  recipe: { id: number; name: string } | null;
};

type WeeklyTrendRow = {
  week_of_year: number;
  calories: number;
  protein: number;
  added_sugar: number;
};
type SearchResult = { id: number; description?: string; name?: string };

describe("mock API server", () => {
  // Constructed directly and reset between tests in-process -- no
  // `/__test__/*` HTTP endpoints exist on the server itself; see server.ts.
  const store = new MockApiStore();
  let server: Server;
  let baseUrl: string;
  let token: string;

  beforeAll(async () => {
    server = createMockApiServer(store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    token = mintAccessToken();
    store.reset();
  });

  async function gql(
    query: string,
    variables: Record<string, unknown> = {},
    bearer: string | null = token,
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    return { status: response.status, body: await response.json() };
  }

  async function createNutritionItem(
    overrides: Partial<{
      description: string;
      calories: number;
      protein_grams: number;
      added_sugars_grams: number;
    }> = {},
  ): Promise<number> {
    const { body } = await gql("mutation CreateNutritionItem { }", {
      nutritionItem: {
        description: "Banana",
        calories: 105,
        total_fat_grams: 0.4,
        saturated_fat_grams: 0,
        trans_fat_grams: 0,
        polyunsaturated_fat_grams: 0,
        monounsaturated_fat_grams: 0,
        cholesterol_milligrams: 0,
        sodium_milligrams: 1,
        total_carbohydrate_grams: 27,
        dietary_fiber_grams: 3.1,
        total_sugars_grams: 14,
        added_sugars_grams: 0,
        protein_grams: 1.3,
        ...overrides,
      },
    });
    return dataOf<{ insert_food_diary_nutrition_item_one: IdResult }>(body)
      .insert_food_diary_nutrition_item_one.id;
  }

  async function createRecipe(
    totalServings: number,
    items: Array<{ servings: number; nutrition_item_id: number }>,
    name = "Toast",
  ): Promise<number> {
    const { body } = await gql("mutation CreateRecipe { }", {
      input: {
        name,
        total_servings: totalServings,
        recipe_items: { data: items },
      },
    });
    return dataOf<{ insert_food_diary_recipe_one: IdResult }>(body)
      .insert_food_diary_recipe_one.id;
  }

  async function createDiaryEntry(entry: {
    servings: number;
    nutrition_item_id?: number;
    recipe_id?: number;
  }): Promise<number> {
    const { body } = await gql("mutation CreateDiaryEntry { }", { entry });
    return dataOf<{ insert_food_diary_diary_entry_one: IdResult }>(body)
      .insert_food_diary_diary_entry_one.id;
  }

  async function getDiaryEntry(id: number): Promise<ExpandedDiaryEntry | null> {
    const { body } = await gql("query GetDiaryEntry { }", { id });
    return dataOf<{ food_diary_diary_entry_by_pk: ExpandedDiaryEntry | null }>(
      body,
    ).food_diary_diary_entry_by_pk;
  }

  async function insertWithNewItem(
    consumed_at: string,
    description: string,
    calories: number,
  ): Promise<void> {
    await gql("mutation InsertDiaryEntriesWithNewItems { }", {
      entries: [
        {
          consumed_at,
          servings: 1,
          nutrition_item: { data: { description, calories } },
        },
      ],
    });
  }

  describe("auth", () => {
    it("rejects a request with no Authorization header", async () => {
      const { status } = await gql("query GetEntries { }", {}, null);
      expect(status).toBe(401);
    });

    it("rejects a request with a garbage token", async () => {
      const { status } = await gql("query GetEntries { }", {}, "not-a-jwt");
      expect(status).toBe(401);
    });

    it("rejects an expired token", async () => {
      const expired = mintAccessToken({ expiresInSeconds: -10 });
      const { status } = await gql("query GetEntries { }", {}, expired);
      expect(status).toBe(401);
    });

    it("accepts a valid, unexpired token", async () => {
      const { status } = await gql("query GetEntries { }");
      expect(status).toBe(200);
    });

    it("gates the REST endpoints too, not just /v1/graphql", async () => {
      const response = await fetch(`${baseUrl}/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "banana" }),
      });
      expect(response.status).toBe(401);
    });
  });

  describe("unhandled operations", () => {
    it("returns a loud 500 instead of silently ignoring an unknown operation", async () => {
      const { status, body } = await gql(
        "query SomeOperationTheMockDoesNotKnow { }",
      );
      expect(status).toBe(500);
      expect(errorsOf(body)[0].message).toContain("unhandled operation");
    });
  });

  describe("nutrition items", () => {
    it("creates and fetches a nutrition item, aliasing fields to camelCase", async () => {
      const id = await createNutritionItem({
        description: "Peanut Butter",
        calories: 190,
      });

      const { body } = await gql("query GetNutritionItem { }", { id });
      const item = dataOf<{
        food_diary_nutrition_item_by_pk: NutritionItemCamel | null;
      }>(body).food_diary_nutrition_item_by_pk;
      expect(item?.description).toBe("Peanut Butter");
      expect(item?.calories).toBe(190);
      expect(item?.totalFatGrams).toBeDefined();
      expect(item && "total_fat_grams" in item).toBe(false);
    });

    it("returns null for a nutrition item that doesn't exist", async () => {
      const { body } = await gql("query GetNutritionItem { }", { id: 99999 });
      expect(
        dataOf<{ food_diary_nutrition_item_by_pk: unknown }>(body)
          .food_diary_nutrition_item_by_pk,
      ).toBeNull();
    });

    it("fetches a nutrition item by a numeric-string id, matching real Hasura's Int coercion", async () => {
      const id = await createNutritionItem({ description: "Almonds" });

      const { body } = await gql("query GetNutritionItem { }", {
        id: String(id),
      });
      expect(
        dataOf<{ food_diary_nutrition_item_by_pk: NutritionItemCamel | null }>(
          body,
        ).food_diary_nutrition_item_by_pk?.description,
      ).toBe("Almonds");
    });

    it("updates a nutrition item", async () => {
      const id = await createNutritionItem({ calories: 100 });
      await gql("mutation UpdateItem { }", {
        id,
        attrs: { id, calories: 150 },
      });

      const { body } = await gql("query GetNutritionItem { }", { id });
      expect(
        dataOf<{ food_diary_nutrition_item_by_pk: NutritionItemCamel }>(body)
          .food_diary_nutrition_item_by_pk.calories,
      ).toBe(150);
    });

    it("searches nutrition items by description substring, case-insensitively", async () => {
      await createNutritionItem({ description: "Banana" });
      await createNutritionItem({ description: "Apple" });

      const { body } = await gql("query SearchItems { }", { search: "ban" });
      const data = dataOf<{
        food_diary_search_nutrition_items: SearchResult[];
        food_diary_search_recipes?: SearchResult[];
      }>(body);
      expect(data.food_diary_search_nutrition_items).toHaveLength(1);
      expect(data.food_diary_search_nutrition_items[0].description).toBe(
        "Banana",
      );
      expect(data.food_diary_search_recipes).toBeUndefined();
    });
  });

  describe("recipes", () => {
    it("creates a recipe and computes per-serving calories", async () => {
      const itemId = await createNutritionItem({
        description: "Bread",
        calories: 80,
      });
      const id = await createRecipe(2, [
        { servings: 1, nutrition_item_id: itemId },
      ]);

      const { body } = await gql("query GetRecipe { }", { id });
      const recipe = dataOf<{ food_diary_recipe_by_pk: ExpandedRecipe }>(
        body,
      ).food_diary_recipe_by_pk;
      expect(recipe.name).toBe("Toast");
      expect(recipe.calories).toBe(40); // 1 serving of an 80-cal item / 2 total servings
      expect(recipe.recipe_items).toHaveLength(1);
    });

    it("searches recipes by name substring", async () => {
      const itemId = await createNutritionItem({
        description: "Bread",
        calories: 80,
      });
      await createRecipe(2, [{ servings: 1, nutrition_item_id: itemId }]);

      const { body } = await gql("query SearchItemsAndRecipes { }", {
        search: "toast",
      });
      const data = dataOf<{
        food_diary_search_nutrition_items: SearchResult[];
        food_diary_search_recipes: SearchResult[];
      }>(body);
      expect(data.food_diary_search_recipes).toHaveLength(1);
      expect(data.food_diary_search_nutrition_items).toBeDefined();
    });

    it("updates a recipe, replacing its items and reporting affected_rows", async () => {
      const itemId = await createNutritionItem({
        description: "Bread",
        calories: 80,
      });
      const id = await createRecipe(2, [
        { servings: 1, nutrition_item_id: itemId },
      ]);
      const secondItemId = await createNutritionItem({
        description: "Butter",
        calories: 100,
      });

      const { body } = await gql("mutation UpdateRecipe { }", {
        id,
        attrs: { name: "Buttered Toast", total_servings: 1 },
        items: [
          { servings: 1, nutrition_item_id: itemId, recipe_id: id },
          { servings: 1, nutrition_item_id: secondItemId, recipe_id: id },
        ],
      });
      const mutationResult = dataOf<{
        delete_food_diary_recipe_item: AffectedRows;
        insert_food_diary_recipe_item: AffectedRows;
      }>(body);
      expect(mutationResult.delete_food_diary_recipe_item.affected_rows).toBe(
        1,
      );
      expect(mutationResult.insert_food_diary_recipe_item.affected_rows).toBe(
        2,
      );

      const { body: getBody } = await gql("query GetRecipe { }", { id });
      const recipe = dataOf<{ food_diary_recipe_by_pk: ExpandedRecipe }>(
        getBody,
      ).food_diary_recipe_by_pk;
      expect(recipe.name).toBe("Buttered Toast");
      expect(recipe.recipe_items).toHaveLength(2);
      expect(recipe.calories).toBe(180); // (80 + 100) / 1 total serving
    });
  });

  describe("diary entries", () => {
    it("logs a nutrition item and computes calories = servings * item.calories", async () => {
      const itemId = await createNutritionItem({ calories: 105 });
      const entryId = await createDiaryEntry({
        servings: 2,
        nutrition_item_id: itemId,
      });

      const entry = await getDiaryEntry(entryId);
      expect(entry?.calories).toBe(210);
      expect(entry?.nutrition_item?.id).toBe(itemId);
      expect(entry?.consumed_at).toBeTruthy();
    });

    it("fetches a diary entry by a numeric-string id, matching real Hasura's Int coercion", async () => {
      const itemId = await createNutritionItem({ calories: 105 });
      const entryId = await createDiaryEntry({
        servings: 1,
        nutrition_item_id: itemId,
      });

      const { body } = await gql("query GetDiaryEntry { }", {
        id: String(entryId),
      });
      expect(
        dataOf<{ food_diary_diary_entry_by_pk: ExpandedDiaryEntry | null }>(
          body,
        ).food_diary_diary_entry_by_pk?.id,
      ).toBe(entryId);
    });

    it("logs a recipe and computes calories = servings * recipe.calories (per serving)", async () => {
      const itemId = await createNutritionItem({ calories: 80 });
      const recipeId = await createRecipe(2, [
        { servings: 1, nutrition_item_id: itemId },
      ]);
      const entryId = await createDiaryEntry({
        servings: 3,
        recipe_id: recipeId,
      });

      const entry = await getDiaryEntry(entryId);
      // recipe is 40 cal/serving (80/2); 3 servings logged => 120
      expect(entry?.calories).toBe(120);
    });

    it("updates a diary entry's servings and recomputes calories", async () => {
      const itemId = await createNutritionItem({ calories: 100 });
      const entryId = await createDiaryEntry({
        servings: 1,
        nutrition_item_id: itemId,
      });

      await gql("mutation UpdateDiaryEntry { }", {
        id: entryId,
        attrs: { id: entryId, servings: 2.5 },
      });

      const entry = await getDiaryEntry(entryId);
      expect(entry?.servings).toBe(2.5);
      expect(entry?.calories).toBe(250);
    });

    it("updates consumed_at independently of servings", async () => {
      const itemId = await createNutritionItem();
      const entryId = await createDiaryEntry({
        servings: 1,
        nutrition_item_id: itemId,
      });

      await gql("mutation UpdateDiaryEntry { }", {
        id: entryId,
        attrs: { id: entryId, consumed_at: "2026-01-01T12:00:00.000Z" },
      });

      const entry = await getDiaryEntry(entryId);
      expect(entry?.consumed_at).toBe("2026-01-01T12:00:00.000Z");
    });

    it("deletes a diary entry", async () => {
      const itemId = await createNutritionItem();
      const entryId = await createDiaryEntry({
        servings: 1,
        nutrition_item_id: itemId,
      });

      const { body: deleteBody } = await gql("mutation DeleteEntry { }", {
        id: entryId,
      });
      expect(
        dataOf<{ delete_food_diary_diary_entry_by_pk: IdResult }>(deleteBody)
          .delete_food_diary_diary_entry_by_pk.id,
      ).toBe(entryId);

      expect(await getDiaryEntry(entryId)).toBeNull();
    });

    it("GetEntries filters by date range and sorts by day desc, then time asc within a day", async () => {
      await insertWithNewItem("2026-01-02T08:00:00.000Z", "a", 1);
      await insertWithNewItem("2026-01-02T18:00:00.000Z", "b", 1);
      await insertWithNewItem("2026-01-03T08:00:00.000Z", "c", 1);
      await insertWithNewItem("2025-12-31T08:00:00.000Z", "outside-range", 1);

      const { body } = await gql("query GetEntries { }", {
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-04T00:00:00.000Z",
      });
      const entries = dataOf<{ food_diary_diary_entry: ExpandedDiaryEntry[] }>(
        body,
      ).food_diary_diary_entry;
      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.consumed_at)).toEqual([
        "2026-01-03T08:00:00.000Z",
        "2026-01-02T08:00:00.000Z",
        "2026-01-02T18:00:00.000Z",
      ]);
    });
  });

  describe("CSV import (InsertDiaryEntriesWithNewItems)", () => {
    it("creates a new nutrition item per entry and logs it", async () => {
      const { body } = await gql(
        "mutation InsertDiaryEntriesWithNewItems { }",
        {
          entries: [
            {
              consumed_at: "2026-02-01T12:00:00.000Z",
              servings: 1,
              nutrition_item: {
                data: { description: "Imported Item", calories: 50 },
              },
            },
          ],
        },
      );
      expect(
        dataOf<{ insert_food_diary_diary_entry: AffectedRows }>(body)
          .insert_food_diary_diary_entry.affected_rows,
      ).toBe(1);

      const { body: entriesBody } = await gql("query GetEntries { }");
      const entries = dataOf<{ food_diary_diary_entry: ExpandedDiaryEntry[] }>(
        entriesBody,
      ).food_diary_diary_entry;
      expect(entries).toHaveLength(1);
      expect(entries[0].nutrition_item?.description).toBe("Imported Item");
      expect(entries[0].calories).toBe(50);
    });
  });

  describe("weekly stats", () => {
    it("sums calories within each range and returns null for an empty range", async () => {
      await insertWithNewItem("2026-03-10T12:00:00.000Z", "x", 300);

      type StatsResult = {
        current_week: { aggregate: { sum: { calories: number | null } } };
        past_four_weeks: { aggregate: { sum: { calories: number | null } } };
      };

      const { body } = await gql("query GetWeeklyStats { }", {
        currentWeekStart: "2026-03-09T00:00:00.000Z",
        todayStart: "2026-03-11T00:00:00.000Z",
        fourWeeksAgoStart: "2026-02-01T00:00:00.000Z",
      });
      const stats = dataOf<StatsResult>(body);
      expect(stats.current_week.aggregate.sum.calories).toBe(300);
      expect(stats.past_four_weeks.aggregate.sum.calories).toBe(300);

      const { body: emptyBody } = await gql("query GetWeeklyStats { }", {
        currentWeekStart: "2020-01-01T00:00:00.000Z",
        todayStart: "2020-01-08T00:00:00.000Z",
        fourWeeksAgoStart: "2019-12-01T00:00:00.000Z",
      });
      expect(
        dataOf<StatsResult>(emptyBody).current_week.aggregate.sum.calories,
      ).toBeNull();
    });
  });

  describe("suggestions", () => {
    it("GetRecentEntryItems returns at most 5, most recent first", async () => {
      for (let i = 0; i < 7; i++) {
        await insertWithNewItem(
          `2026-04-0${i + 1}T12:00:00.000Z`,
          `item-${i}`,
          10,
        );
      }
      const { body } = await gql("query GetRecentEntryItems { }");
      const entries = dataOf<{
        food_diary_diary_entry_recent: SuggestionEntry[];
      }>(body).food_diary_diary_entry_recent;
      expect(entries).toHaveLength(5);
      expect(entries[0].nutrition_item?.description).toBe("item-6");
    });

    it("TopEntriesAroundHour groups by item/recipe and orders by frequency", async () => {
      const itemId = await createNutritionItem({ description: "Coffee" });
      for (let i = 0; i < 3; i++) {
        await createDiaryEntry({ servings: 1, nutrition_item_id: itemId });
      }
      await insertWithNewItem(new Date().toISOString(), "Toast", 80);

      const nowHour = new Date().getUTCHours();
      const { body } = await gql("query TopEntriesAroundHour { }", {
        startHour: Math.max(0, nowHour - 1),
        endHour: Math.min(23, nowHour + 1),
      });
      const top = dataOf<{
        food_diary_top_entries_around_hour: SuggestionEntry[];
      }>(body).food_diary_top_entries_around_hour;
      expect(top[0].nutrition_item?.description).toBe("Coffee");
    });

    it("GetTopLoggedItems returns up to 100 raw entries for client-side frequency counting", async () => {
      const itemId = await createNutritionItem();
      await createDiaryEntry({ servings: 1, nutrition_item_id: itemId });
      const { body } = await gql("query GetTopLoggedItems { }");
      expect(
        dataOf<{ food_diary_diary_entry: SuggestionEntry[] }>(body)
          .food_diary_diary_entry,
      ).toHaveLength(1);
    });
  });

  describe("export", () => {
    it("ExportEntriesWithDateRange is inclusive on both ends (_gte/_lte)", async () => {
      await insertWithNewItem("2026-05-01T00:00:00.000Z", "boundary-start", 1);
      await insertWithNewItem("2026-05-07T23:59:59.000Z", "boundary-end", 1);

      const { body } = await gql("query ExportEntriesWithDateRange { }", {
        startDate: "2026-05-01T00:00:00.000Z",
        endDate: "2026-05-07T23:59:59.000Z",
      });
      expect(
        dataOf<{ food_diary_diary_entry: ExpandedDiaryEntry[] }>(body)
          .food_diary_diary_entry,
      ).toHaveLength(2);
    });

    it("ExportEntries with no variables returns everything", async () => {
      await insertWithNewItem("2026-05-01T00:00:00.000Z", "x", 1);
      const { body } = await gql("query ExportEntries { }");
      expect(
        dataOf<{ food_diary_diary_entry: ExpandedDiaryEntry[] }>(body)
          .food_diary_diary_entry,
      ).toHaveLength(1);
    });
  });

  describe("weekly trends", () => {
    it("averages calories/protein/added_sugar per ISO week", async () => {
      const itemId = await createNutritionItem({
        calories: 100,
        protein_grams: 10,
        added_sugars_grams: 5,
      });
      for (const consumed_at of [
        "2026-06-01T12:00:00.000Z",
        "2026-06-03T12:00:00.000Z",
      ]) {
        const entryId = await createDiaryEntry({
          servings: 1,
          nutrition_item_id: itemId,
        });
        await gql("mutation UpdateDiaryEntry { }", {
          id: entryId,
          attrs: { id: entryId, consumed_at },
        });
      }

      const { body } = await gql("query GetWeeklyTrends { }");
      const weeks = dataOf<{ food_diary_trends_weekly: WeeklyTrendRow[] }>(
        body,
      ).food_diary_trends_weekly;
      expect(weeks).toHaveLength(1);
      expect(weeks[0].calories).toBe(100);
      expect(weeks[0].protein).toBe(10);
      expect(weeks[0].added_sugar).toBe(5);
    });
  });

  describe("nutrition targets", () => {
    type TargetRow = {
      calories: number;
      calories_max: number;
      protein_grams: number;
      dietary_fiber_grams: number;
      added_sugars_grams: number;
    };

    it("returns an empty array before any target is set", async () => {
      const { body } = await gql("query GetNutritionTargets { }");
      expect(
        dataOf<{ food_diary_nutrition_target: TargetRow[] }>(body)
          .food_diary_nutrition_target,
      ).toEqual([]);
    });

    it("upserts and then returns the saved target, keyed by the token's sub", async () => {
      await gql("mutation SetNutritionTargets { }", {
        target: {
          calories: 2000,
          calories_max: 2400,
          protein_grams: 130,
          dietary_fiber_grams: 25,
          added_sugars_grams: 25,
        },
      });
      const { body } = await gql("query GetNutritionTargets { }");
      const targets = dataOf<{ food_diary_nutrition_target: TargetRow[] }>(
        body,
      ).food_diary_nutrition_target;
      expect(targets).toHaveLength(1);
      expect(targets[0].calories).toBe(2000);
    });
  });

  describe("REST endpoints", () => {
    type LookupResult = { item: { description: string; calories: number } };
    type UploadResult = { image: Record<string, unknown> };

    it("POST /lookup returns deterministic nutrition data for the same description", async () => {
      const post = async (): Promise<LookupResult> => {
        const response = await fetch(`${baseUrl}/lookup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ description: "banana" }),
        });
        return (await response.json()) as LookupResult;
      };
      const first = await post();
      const second = await post();
      expect(first.item.description).toBe("banana");
      expect(first.item.calories).toBe(second.item.calories);
    });

    it("POST /upload returns canned nutrition data using its own key naming convention", async () => {
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([new Uint8Array([1, 2, 3])]),
        "capture.jpg",
      );
      const response = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const body = (await response.json()) as UploadResult;
      expect(response.status).toBe(200);
      expect(body.image.cholesterol_mg).toBeDefined();
      expect(body.image.cholesterol_milligrams).toBeUndefined();
    });
  });

  it("store.reset() (used directly by beforeEach above) actually wipes the store", async () => {
    await createNutritionItem();
    store.reset();
    const { body } = await gql("query GetEntries { }");
    expect(
      dataOf<{ food_diary_diary_entry: unknown[] }>(body)
        .food_diary_diary_entry,
    ).toEqual([]);
  });
});
