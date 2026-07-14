import { describe, expect, it, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import {
  fetchEntries,
  createNutritionItem,
  updateNutritionItem,
  createRecipe,
  lookupNutritionWithLLM,
  GraphQLError,
  registerLogoutHandler,
} from "./Api";

describe("Api authorization error handling", () => {
  afterEach(() => {
    // Clear the logout handler between tests to avoid cross-test pollution
    registerLogoutHandler(undefined);
  });

  it("should throw AuthorizationError when API returns 401", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        });
      }),
    );

    await expect(fetchEntries("test-token")).rejects.toThrow(
      "Authorization failed",
    );
  });

  it("should invoke registered logout handler when API returns 401", async () => {
    const mockHandler = vi.fn();
    registerLogoutHandler(mockHandler);

    server.use(
      http.post("/api/v1/graphql", () => {
        return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        });
      }),
    );

    await expect(fetchEntries("test-token")).rejects.toThrow(
      "Authorization failed",
    );
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it("should invoke registered logout handler when API returns 403", async () => {
    const mockHandler = vi.fn();
    registerLogoutHandler(mockHandler);

    server.use(
      http.post("/api/v1/graphql", () => {
        return new HttpResponse(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }),
    );

    await expect(fetchEntries("test-token")).rejects.toThrow(
      "Authorization failed",
    );
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it("should not invoke registered logout handler when API returns 200", async () => {
    const mockHandler = vi.fn();
    registerLogoutHandler(mockHandler);

    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({ data: { food_diary_diary_entry: [] } });
      }),
    );

    await fetchEntries("test-token");
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("should throw AuthorizationError when API returns 403", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return new HttpResponse(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }),
    );

    await expect(fetchEntries("test-token")).rejects.toThrow(
      "Authorization failed",
    );
  });

  it("should return data normally when API returns 200", async () => {
    const mockData = {
      data: {
        food_diary_diary_entry: [],
      },
    };

    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json(mockData);
      }),
    );

    const result = await fetchEntries("test-token");
    expect(result).toEqual(mockData);
  });

  it("should throw generic error for non-auth errors", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return new HttpResponse(JSON.stringify({ error: "Server error" }), {
          status: 500,
          statusText: "Internal Server Error",
        });
      }),
    );

    await expect(fetchEntries("test-token")).rejects.toThrow(
      "API request failed: 500 Internal Server Error",
    );
  });

  it("should throw GraphQLError when response contains errors field", async () => {
    const mockErrorResponse = {
      errors: [
        {
          message:
            'Uniqueness violation. duplicate key value violates unique constraint "nutrition_item_pkey"',
          extensions: {
            path: "$.selectionSet.insert_food_diary_nutrition_item_one",
            code: "constraint-violation",
          },
        },
      ],
    };

    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json(mockErrorResponse);
      }),
    );

    await expect(fetchEntries("test-token")).rejects.toThrow(GraphQLError);
    await expect(fetchEntries("test-token")).rejects.toThrow(
      'Uniqueness violation. duplicate key value violates unique constraint "nutrition_item_pkey"',
    );
  });
});

describe("createNutritionItem", () => {
  it("should exclude id field when creating a new nutrition item", async () => {
    let capturedVariables: unknown = null;

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body = (await request.json()) as {
          query: string;
          variables: unknown;
        };
        capturedVariables = body.variables;

        return HttpResponse.json({
          data: {
            insert_food_diary_nutrition_item_one: {
              id: 123,
            },
          },
        });
      }),
    );

    const item = {
      id: 999, // This should be excluded
      description: "Test Food",
      calories: 100,
      totalFatGrams: 5,
      saturatedFatGrams: 1,
      transFatGrams: 0,
      polyunsaturatedFatGrams: 1,
      monounsaturatedFatGrams: 2,
      cholesterolMilligrams: 10,
      sodiumMilligrams: 50,
      totalCarbohydrateGrams: 20,
      dietaryFiberGrams: 3,
      totalSugarsGrams: 5,
      addedSugarsGrams: 2,
      proteinGrams: 4,
    };

    await createNutritionItem("test-token", item);

    expect(capturedVariables).toBeTruthy();
    const vars = capturedVariables as {
      nutritionItem: Record<string, unknown>;
    };
    expect(vars.nutritionItem).toBeTruthy();
    // Verify that id is NOT included in the nutritionItem
    expect("id" in vars.nutritionItem).toBe(false);
    // Verify other fields are present (in snake_case)
    expect(vars.nutritionItem.description).toBe("Test Food");
    expect(vars.nutritionItem.calories).toBe(100);
  });
});

describe("updateNutritionItem", () => {
  it("should update an existing nutrition item", async () => {
    let capturedVariables: unknown = null;

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body = (await request.json()) as {
          query: string;
          variables: unknown;
        };
        capturedVariables = body.variables;

        return HttpResponse.json({
          data: {
            update_food_diary_nutrition_item_by_pk: {
              id: 123,
            },
          },
        });
      }),
    );

    const item = {
      id: 123,
      description: "Updated Food",
      calories: 150,
      totalFatGrams: 7,
      saturatedFatGrams: 2,
      transFatGrams: 0,
      polyunsaturatedFatGrams: 1,
      monounsaturatedFatGrams: 3,
      cholesterolMilligrams: 15,
      sodiumMilligrams: 60,
      totalCarbohydrateGrams: 25,
      dietaryFiberGrams: 4,
      totalSugarsGrams: 6,
      addedSugarsGrams: 3,
      proteinGrams: 5,
    };

    await updateNutritionItem("test-token", item);

    expect(capturedVariables).toBeTruthy();
    const vars = capturedVariables as {
      id: number;
      attrs: Record<string, unknown>;
    };
    expect(vars.id).toBe(123);
    expect(vars.attrs).toBeTruthy();
    // Verify fields are in snake_case
    expect(vars.attrs.description).toBe("Updated Food");
    expect(vars.attrs.calories).toBe(150);
  });
});

describe("lookupNutritionWithLLM", () => {
  const snakeItem = {
    description: "Grilled chicken breast",
    calories: 165,
    total_fat_grams: 3.6,
    saturated_fat_grams: 1.0,
    trans_fat_grams: 0,
    polyunsaturated_fat_grams: 0.8,
    monounsaturated_fat_grams: 1.2,
    cholesterol_milligrams: 85,
    sodium_milligrams: 74,
    total_carbohydrate_grams: 0,
    dietary_fiber_grams: 0,
    total_sugars_grams: 0,
    added_sugars_grams: 0,
    protein_grams: 31,
  };

  it("maps snake_case response fields to camelCase NutritionItemAttrs", async () => {
    server.use(
      http.post("/llm/lookup", () => HttpResponse.json({ item: snakeItem })),
    );

    const result = await lookupNutritionWithLLM(
      "test-token",
      "100g grilled chicken breast",
    );

    expect(result.description).toBe("Grilled chicken breast");
    expect(result.calories).toBe(165);
    expect(result.totalFatGrams).toBe(3.6);
    expect(result.saturatedFatGrams).toBe(1.0);
    expect(result.transFatGrams).toBe(0);
    expect(result.polyunsaturatedFatGrams).toBe(0.8);
    expect(result.monounsaturatedFatGrams).toBe(1.2);
    expect(result.cholesterolMilligrams).toBe(85);
    expect(result.sodiumMilligrams).toBe(74);
    expect(result.totalCarbohydrateGrams).toBe(0);
    expect(result.dietaryFiberGrams).toBe(0);
    expect(result.totalSugarsGrams).toBe(0);
    expect(result.addedSugarsGrams).toBe(0);
    expect(result.proteinGrams).toBe(31);
  });

  it("defaults numeric fields to 0 when response contains non-numeric values", async () => {
    server.use(
      http.post("/llm/lookup", () =>
        HttpResponse.json({
          item: {
            description: "Unknown food",
            calories: "not-a-number",
            total_fat_grams: null,
            saturated_fat_grams: undefined,
          },
        }),
      ),
    );

    const result = await lookupNutritionWithLLM("test-token", "unknown food");

    expect(result.description).toBe("Unknown food");
    expect(result.calories).toBe(0);
    expect(result.totalFatGrams).toBe(0);
    expect(result.saturatedFatGrams).toBe(0);
  });

  it("defaults description to empty string when response contains non-string description", async () => {
    server.use(
      http.post("/llm/lookup", () =>
        HttpResponse.json({ item: { ...snakeItem, description: 42 } }),
      ),
    );

    const result = await lookupNutritionWithLLM("test-token", "some food");
    expect(result.description).toBe("");
  });

  it("throws an error using statusText when response body has no error field", async () => {
    server.use(
      http.post(
        "/llm/lookup",
        () =>
          new HttpResponse(null, {
            status: 500,
            statusText: "Internal Server Error",
          }),
      ),
    );

    await expect(
      lookupNutritionWithLLM("test-token", "some food"),
    ).rejects.toThrow("Internal Server Error");
  });

  it("throws an error using the message from the JSON error body", async () => {
    server.use(
      http.post(
        "/llm/lookup",
        () =>
          new HttpResponse(JSON.stringify({ error: "Model unavailable" }), {
            status: 500,
            statusText: "Internal Server Error",
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    await expect(
      lookupNutritionWithLLM("test-token", "some food"),
    ).rejects.toThrow("Model unavailable");
  });
});

describe("createRecipe", () => {
  it("should transform recipe input correctly", async () => {
    let capturedVariables: unknown = null;

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body = (await request.json()) as {
          query: string;
          variables: unknown;
        };
        capturedVariables = body.variables;

        return HttpResponse.json({
          data: {
            insert_food_diary_recipe_one: {
              id: 456,
            },
          },
        });
      }),
    );

    const recipeInput = {
      name: "Test Recipe",
      total_servings: 4,
      recipe_items: [
        {
          servings: 1,
          nutrition_item: {
            id: 100,
            description: "Item 1",
            calories: 50,
          },
        },
        {
          servings: 2,
          nutrition_item: {
            id: 101,
            description: "Item 2",
            calories: 75,
          },
        },
      ],
    };

    await createRecipe("test-token", recipeInput);

    expect(capturedVariables).toBeTruthy();
    const vars = capturedVariables as {
      input: {
        name: string;
        total_servings: number;
        recipe_items: {
          data: Array<{ servings: number; nutrition_item_id: number }>;
        };
      };
    };
    expect(vars.input.name).toBe("Test Recipe");
    expect(vars.input.total_servings).toBe(4);
    expect(vars.input.recipe_items.data).toHaveLength(2);
    expect(vars.input.recipe_items.data[0].nutrition_item_id).toBe(100);
    expect(vars.input.recipe_items.data[1].nutrition_item_id).toBe(101);
  });
});
