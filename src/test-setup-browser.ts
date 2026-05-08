import { beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse, type HttpResponseResolver } from "msw";
import { setupWorker } from "msw/browser";
import { calculateFourWeeksDays } from "./WeeklyStatsCalculations";

interface GraphQLRequest {
  query: string;
}

function isGraphQLRequest(obj: unknown): obj is GraphQLRequest {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return "query" in record && typeof record.query === "string";
}

// Mock data for tests - defined here so handlers can access them
const mockNutritionItems = [
  {
    id: 1,
    description: "Banana",
    calories: 105,
    total_fat_grams: 0.4,
    added_sugars_grams: 0,
    protein_grams: 1.3,
    dietary_fiber_grams: 3.1,
  },
  {
    id: 2,
    description: "Apple",
    calories: 95,
    total_fat_grams: 0.3,
    added_sugars_grams: 0,
    protein_grams: 0.5,
    dietary_fiber_grams: 4.4,
  },
];

const mockRecipes = [
  {
    id: 1,
    name: "Fruit Salad",
    calories: 200,
    recipe_items: [
      {
        servings: 1,
        nutrition_item: mockNutritionItems[0],
      },
      {
        servings: 1,
        nutrition_item: mockNutritionItems[1],
      },
    ],
  },
];

const mockDiaryEntries = [
  {
    id: 1,
    consumed_at: "2024-01-01T12:00:00Z",
    servings: 1,
    calories: 105,
    nutrition_item: mockNutritionItems[0],
    recipe: null,
  },
];

const mockRecentEntries = [
  {
    consumed_at: "2024-01-01T12:00:00Z",
    nutrition_item: mockNutritionItems[0],
    recipe: null,
  },
];

// Setup MSW worker for browser mode with handlers
const graphqlHandler: HttpResponseResolver = async ({ request }) => {
  const body: unknown = await request.json();
  if (!isGraphQLRequest(body)) {
    return HttpResponse.json({ errors: [{ message: "Invalid request" }] });
  }
  const query: string = body.query || "";

  // Handle GetEntries query
  if (query.includes("GetEntries")) {
    return HttpResponse.json({
      data: {
        food_diary_diary_entry: mockDiaryEntries,
      },
    });
  }

  // Handle GetWeeklyTrends query
  if (query.includes("GetWeeklyTrends")) {
    return HttpResponse.json({
      data: {
        food_diary_trends_weekly: [],
      },
    });
  }

  // Handle GetWeeklyStats query
  if (query.includes("GetWeeklyStats")) {
    // Use fixed 7-day rolling window and calculate 4-week period
    const now = new Date();
    const currentWeekDays = 7;
    const fourWeeksDays = calculateFourWeeksDays(now);

    // Target: 300 kcal/day for both metrics
    const targetDailyCalories = 300;

    return HttpResponse.json({
      data: {
        current_week: {
          aggregate: {
            sum: {
              calories: targetDailyCalories * currentWeekDays,
            },
          },
        },
        past_four_weeks: {
          aggregate: {
            sum: {
              calories: targetDailyCalories * fourWeeksDays,
            },
          },
        },
      },
    });
  }

  // Handle GetRecentEntryItems query
  if (query.includes("GetRecentEntryItems")) {
    return HttpResponse.json({
      data: {
        food_diary_diary_entry_recent: mockRecentEntries,
      },
    });
  }

  // Handle TopEntriesAroundHour query
  if (query.includes("TopEntriesAroundHour")) {
    return HttpResponse.json({
      data: {
        food_diary_top_entries_around_hour: [],
      },
    });
  }

  // Handle GetTopLoggedItems query
  if (query.includes("GetTopLoggedItems")) {
    return HttpResponse.json({
      data: {
        food_diary_diary_entry: [],
      },
    });
  }

  // Handle SearchItemsAndRecipes query
  if (query.includes("SearchItemsAndRecipes")) {
    return HttpResponse.json({
      data: {
        food_diary_search_nutrition_items: mockNutritionItems,
        food_diary_search_recipes: mockRecipes,
      },
    });
  }

  // Handle SearchItems query
  if (query.includes("SearchItems")) {
    return HttpResponse.json({
      data: {
        food_diary_search_nutrition_items: mockNutritionItems,
      },
    });
  }

  // Handle CreateDiaryEntry mutation
  if (query.includes("CreateDiaryEntry")) {
    return HttpResponse.json({
      data: {
        insert_food_diary_diary_entry_one: {
          id: 100,
        },
      },
    });
  }

  // Handle CreateNutritionItem mutation
  if (query.includes("CreateNutritionItem")) {
    return HttpResponse.json({
      data: {
        insert_food_diary_nutrition_item_one: {
          id: 200,
        },
      },
    });
  }

  // Handle CreateRecipe mutation
  if (query.includes("CreateRecipe")) {
    return HttpResponse.json({
      data: {
        insert_food_diary_recipe_one: {
          id: 300,
        },
      },
    });
  }

  // Handle DeleteEntry mutation
  if (query.includes("DeleteEntry")) {
    return HttpResponse.json({
      data: {
        delete_food_diary_diary_entry_by_pk: {
          id: 1,
        },
      },
    });
  }

  // If we reach here, it's an unhandled GraphQL query
  // Throw an error so the test fails
  const queryPreview: string = query.substring(0, 100);
  console.error("Unhandled GraphQL query:", query);
  throw new Error(`Unhandled GraphQL query: ${queryPreview}`);
};

export const worker = setupWorker(
  http.post("*/api/v1/graphql", graphqlHandler),
);

beforeAll(async () => {
  // Start the worker with strict mode: unhandled requests will cause errors
  await worker.start({
    onUnhandledRequest: "error",
    quiet: false,
  });
});

afterEach(() => {
  // Reset handlers after each test to ensure test isolation
  worker.resetHandlers();
});

afterAll(() => {
  // Stop the worker when tests are done
  worker.stop();
});
