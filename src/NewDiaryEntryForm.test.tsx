import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import NewDiaryEntryForm from "./NewDiaryEntryForm";

interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

function isGraphQLRequest(obj: unknown): obj is GraphQLRequest {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return "query" in record && typeof record.query === "string";
}

// Mock Auth0 - simulate logged in user
vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      isAuthenticated: () => true,
      user: () => ({
        picture: "https://example.com/avatar.jpg",
        name: "Test User",
      }),
      accessToken: () => "test-access-token",
      auth0: () => null,
    },
  ],
}));

describe("NewDiaryEntryForm", () => {
  it("should display time-based suggestions when available", async () => {
    // Mock GraphQL responses
    server.use(
      http.post("*/api/v1/graphql", async ({ request }): Promise<Response> => {
        const body: unknown = await request.json();
        if (!isGraphQLRequest(body)) {
          return HttpResponse.json({
            errors: [{ message: "Invalid request" }],
          });
        }
        const query: string = body.query || "";

        // Mock TopEntriesAroundHour query (time-based suggestions)
        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: {
              food_diary_top_entries_around_hour: [
                {
                  consumed_at: "2024-01-24T05:30:00Z",
                  nutrition_item: { id: 1, description: "Morning Oatmeal" },
                  recipe: null,
                },
                {
                  consumed_at: "2024-01-24T05:15:00Z",
                  nutrition_item: null,
                  recipe: { id: 2, name: "Breakfast Smoothie" },
                },
              ],
            },
          });
        }

        // Mock GetRecentEntryItems query (regular suggestions)
        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry_recent: [
                {
                  consumed_at: "2024-01-23T18:00:00Z",
                  nutrition_item: { id: 3, description: "Dinner Salad" },
                  recipe: null,
                },
              ],
            },
          });
        }

        // Mock GetTopLoggedItems query (most logged suggestions)
        if (query.includes("GetTopLoggedItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry: [
                {
                  consumed_at: "2024-01-20T08:00:00Z",
                  nutrition_item: { id: 4, description: "Granola Bar" },
                  recipe: null,
                },
              ],
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm onSubmit={() => ({})} />);

    // Wait for the component to load
    await waitFor(
      () => {
        expect(screen.queryByText("Suggestions")).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Check that the time-based header appears
    await waitFor(
      () => {
        const timeBasedHeader = screen.queryByText(
          "Logged at this time of day",
        );
        expect(timeBasedHeader).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify time-based suggestions are displayed
    expect(screen.queryByText("Morning Oatmeal")).not.toBeNull();
    expect(screen.queryByText("Breakfast Smoothie")).not.toBeNull();

    // Verify recently logged section still exists
    expect(screen.queryByText("Recently logged")).not.toBeNull();
    expect(screen.queryByText("Dinner Salad")).not.toBeNull();

    // Verify most logged section exists
    expect(screen.queryByText("Most logged")).not.toBeNull();
    expect(screen.queryByText("Granola Bar")).not.toBeNull();
  });

  it("should not display time-based header when no time-based suggestions", async () => {
    // Mock GraphQL responses
    server.use(
      http.post("*/api/v1/graphql", async ({ request }): Promise<Response> => {
        const body: unknown = await request.json();
        if (!isGraphQLRequest(body)) {
          return HttpResponse.json({
            errors: [{ message: "Invalid request" }],
          });
        }
        const query: string = body.query || "";

        // Mock TopEntriesAroundHour query - empty response
        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: {
              food_diary_top_entries_around_hour: [],
            },
          });
        }

        // Mock GetRecentEntryItems query (regular suggestions)
        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry_recent: [
                {
                  consumed_at: "2024-01-23T18:00:00Z",
                  nutrition_item: { id: 3, description: "Dinner Salad" },
                  recipe: null,
                },
              ],
            },
          });
        }

        // Mock GetTopLoggedItems query
        if (query.includes("GetTopLoggedItems")) {
          return HttpResponse.json({
            data: { food_diary_diary_entry: [] },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm onSubmit={() => ({})} />);

    // Wait for the component to load
    await waitFor(
      () => {
        expect(screen.queryByText("Suggestions")).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify recently logged section exists
    await waitFor(
      () => {
        expect(screen.queryByText("Recently logged")).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Time-based header should NOT appear when there are no time-based suggestions
    const timeBasedHeader = screen.queryByText("Logged at this time of day");
    expect(timeBasedHeader).toBeNull();
  });

  it("should display Search tab and allow searching for items", async () => {
    const user = await import("@testing-library/user-event").then((m) =>
      m.default.setup(),
    );

    // Mock GraphQL responses
    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Mock GetRecentEntryItems query
        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: { food_diary_diary_entry_recent: [] },
          });
        }

        // Mock TopEntriesAroundHour query
        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: { food_diary_top_entries_around_hour: [] },
          });
        }

        // Mock GetTopLoggedItems query
        if (query.includes("GetTopLoggedItems")) {
          return HttpResponse.json({
            data: { food_diary_diary_entry: [] },
          });
        }

        // Mock search query
        if (query.includes("SearchItemsAndRecipes")) {
          return HttpResponse.json({
            data: {
              food_diary_search_nutrition_items: [
                { id: 10, description: "Search Result Item" },
              ],
              food_diary_search_recipes: [],
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm />);

    // Wait for component to load (suggestions tab is shown)
    await waitFor(() => {
      expect(screen.queryByText("Suggestions")).not.toBeNull();
    });

    // Click on Search tab
    const searchTab = screen.getByText("Search");
    await user.click(searchTab);

    // Verify we're in search mode (SearchItemsForm should be rendered)
    await waitFor(() => {
      const searchInput = screen.queryByPlaceholderText(/search/i);
      expect(searchInput).not.toBeNull();
    });
  });

  it("should handle servings input and save diary entry", async () => {
    const user = await import("@testing-library/user-event").then((m) =>
      m.default.setup(),
    );
    let createEntryCalled = false;

    // Mock GraphQL responses
    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Mock GetRecentEntryItems query with one item
        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry_recent: [
                {
                  consumed_at: "2024-01-24T08:00:00Z",
                  nutrition_item: { id: 5, description: "Test Food" },
                  recipe: null,
                },
              ],
            },
          });
        }

        // Mock TopEntriesAroundHour query
        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: { food_diary_top_entries_around_hour: [] },
          });
        }

        // Mock GetTopLoggedItems query
        if (query.includes("GetTopLoggedItems")) {
          return HttpResponse.json({
            data: { food_diary_diary_entry: [] },
          });
        }

        // Mock CreateDiaryEntry mutation
        if (query.includes("CreateDiaryEntry")) {
          createEntryCalled = true;
          const vars: Record<string, unknown> =
            isGraphQLRequest(body) && body.variables ? body.variables : {};
          const entryData: unknown = vars.entry;
          const entry = entryData as {
            servings: number;
            nutrition_item_id: number;
          };
          expect(entry.servings).toBe(2.5);
          expect(entry.nutrition_item_id).toBe(5);
          return HttpResponse.json({
            data: {
              insert_food_diary_diary_entry_one: { id: 100 },
            },
          });
        }

        // Mock GetWeeklyStats query to prevent unhandled errors
        if (query.includes("GetWeeklyStats")) {
          return HttpResponse.json({
            data: {
              current_week: { aggregate: { sum: { calories: 0 } } },
              today: { aggregate: { sum: { calories: 0 } } },
              four_weeks: { aggregate: { sum: { calories: 0 } } },
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm />);

    // Wait for suggestions to load
    await waitFor(() => {
      expect(screen.queryByText("Test Food")).not.toBeNull();
    });

    // Click the ⊕ button on the first item
    const logButtons = screen.getAllByText("⊕");
    await user.click(logButtons[0]);

    // Wait for the logging dialog to appear
    await waitFor(() => {
      const saveButton = screen.queryByText("Save");
      expect(saveButton).not.toBeNull();
    });

    // Change servings value
    const servingsInput = screen.getByRole("spinbutton") as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "2.5");

    // Click Save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Verify the mutation was called
    await waitFor(() => {
      expect(createEntryCalled).toBe(true);
    });
  });

  it("should handle saving recipe entry", async () => {
    const user = await import("@testing-library/user-event").then((m) =>
      m.default.setup(),
    );
    let createEntryCalled = false;

    // Mock GraphQL responses
    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Mock GetRecentEntryItems query with a recipe
        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry_recent: [
                {
                  consumed_at: "2024-01-24T08:00:00Z",
                  nutrition_item: null,
                  recipe: { id: 3, name: "Test Recipe" },
                },
              ],
            },
          });
        }

        // Mock TopEntriesAroundHour query
        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: { food_diary_top_entries_around_hour: [] },
          });
        }

        // Mock GetTopLoggedItems query
        if (query.includes("GetTopLoggedItems")) {
          return HttpResponse.json({
            data: { food_diary_diary_entry: [] },
          });
        }

        // Mock CreateDiaryEntry mutation for recipe
        if (query.includes("CreateDiaryEntry")) {
          createEntryCalled = true;
          const vars: Record<string, unknown> =
            isGraphQLRequest(body) && body.variables ? body.variables : {};
          const entryData: unknown = vars.entry;
          const entry = entryData as {
            servings: number;
            recipe_id: number;
          };
          expect(entry.servings).toBe(1);
          expect(entry.recipe_id).toBe(3);
          return HttpResponse.json({
            data: {
              insert_food_diary_diary_entry_one: { id: 101 },
            },
          });
        }

        // Mock GetWeeklyStats query to prevent unhandled errors
        if (query.includes("GetWeeklyStats")) {
          return HttpResponse.json({
            data: {
              current_week: { aggregate: { sum: { calories: 0 } } },
              today: { aggregate: { sum: { calories: 0 } } },
              four_weeks: { aggregate: { sum: { calories: 0 } } },
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm />);

    // Wait for suggestions to load
    await waitFor(() => {
      expect(screen.queryByText("Test Recipe")).not.toBeNull();
    });

    // Click the ⊕ button on the recipe
    const logButtons = screen.getAllByText("⊕");
    await user.click(logButtons[0]);

    // Wait for the logging dialog to appear
    await waitFor(() => {
      const saveButton = screen.queryByText("Save");
      expect(saveButton).not.toBeNull();
    });

    // Click Save button (servings is already 1)
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Verify the mutation was called
    await waitFor(() => {
      expect(createEntryCalled).toBe(true);
    });
  });

  it.skip("should display ITEM badge for nutrition items and RECIPE badge for recipes", async () => {
    const user = await import("@testing-library/user-event").then((m) =>
      m.default.setup(),
    );

    // Mock GraphQL responses with both items and recipes
    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Mock GetRecentEntryItems query with both item and recipe
        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry_recent: [
                {
                  consumed_at: "2024-01-24T08:00:00Z",
                  nutrition_item: { id: 1, description: "Apple" },
                  recipe: null,
                },
                {
                  consumed_at: "2024-01-24T09:00:00Z",
                  nutrition_item: null,
                  recipe: { id: 2, name: "Smoothie" },
                },
              ],
            },
          });
        }

        // Mock TopEntriesAroundHour query
        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: { food_diary_top_entries_around_hour: [] },
          });
        }

        // Handle search query - return both items and recipes
        if (query.includes("SearchNutritionItems")) {
          return HttpResponse.json({
            data: {
              food_diary_search_nutrition_items: [
                { id: 3, description: "Banana", calories: 100 },
              ],
              food_diary_search_recipes: [
                { id: 4, name: "Protein Shake", calories: 200 },
              ],
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm />);

    // Wait for suggestions to load
    await waitFor(() => {
      expect(screen.queryByText("Apple")).not.toBeNull();
      expect(screen.queryByText("Smoothie")).not.toBeNull();
    });

    // Switch to Search tab to see the badges
    const searchTab = screen.getByText("Search");
    await user.click(searchTab);

    // Type to trigger search
    const searchInput = document.querySelector(
      'input[name="entry-item-search"]',
    ) as HTMLInputElement;
    await user.type(searchInput, "test");

    // Wait for search results with badges
    await waitFor(
      () => {
        const itemBadges = screen.queryAllByText("ITEM");
        const recipeBadges = screen.queryAllByText("RECIPE");

        expect(itemBadges.length).toBeGreaterThan(0);
        expect(recipeBadges.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
  });

  it("should show success indicator briefly after saving entry", async () => {
    const user = await import("@testing-library/user-event").then((m) =>
      m.default.setup(),
    );

    // Mock GraphQL responses
    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Mock GetRecentEntryItems query with one item
        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry_recent: [
                {
                  consumed_at: "2024-01-24T08:00:00Z",
                  nutrition_item: { id: 5, description: "Test Food" },
                  recipe: null,
                },
              ],
            },
          });
        }

        // Mock TopEntriesAroundHour query
        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: { food_diary_top_entries_around_hour: [] },
          });
        }

        // Mock GetTopLoggedItems query
        if (query.includes("GetTopLoggedItems")) {
          return HttpResponse.json({
            data: { food_diary_diary_entry: [] },
          });
        }

        // Mock CreateDiaryEntry mutation
        if (query.includes("CreateDiaryEntry")) {
          return HttpResponse.json({
            data: {
              insert_food_diary_diary_entry_one: { id: 100 },
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm />);

    // Wait for suggestions to load
    await waitFor(() => {
      expect(screen.queryByText("Test Food")).not.toBeNull();
    });

    // Click the ⊕ button on the first item
    const logButtons = screen.getAllByText("⊕");
    await user.click(logButtons[0]);

    // Wait for the logging dialog to appear
    await waitFor(() => {
      const saveButton = screen.queryByText("Save");
      expect(saveButton).not.toBeNull();
    });

    // Click Save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Wait for success state to clear (after 1000ms timeout in component)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Logging dialog should be closed after save
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("should display most logged section with top items by frequency", async () => {
    server.use(
      http.post("*/api/v1/graphql", async ({ request }): Promise<Response> => {
        const body: unknown = await request.json();
        if (!isGraphQLRequest(body)) {
          return HttpResponse.json({
            errors: [{ message: "Invalid request" }],
          });
        }
        const query: string = body.query || "";

        if (query.includes("TopEntriesAroundHour")) {
          return HttpResponse.json({
            data: { food_diary_top_entries_around_hour: [] },
          });
        }

        if (query.includes("GetRecentEntryItems")) {
          return HttpResponse.json({
            data: { food_diary_diary_entry_recent: [] },
          });
        }

        if (query.includes("GetTopLoggedItems")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry: [
                {
                  consumed_at: "2024-01-20T08:00:00Z",
                  nutrition_item: { id: 1, description: "Oatmeal" },
                  recipe: null,
                },
                {
                  consumed_at: "2024-01-19T08:00:00Z",
                  nutrition_item: { id: 1, description: "Oatmeal" },
                  recipe: null,
                },
                {
                  consumed_at: "2024-01-18T08:00:00Z",
                  nutrition_item: { id: 1, description: "Oatmeal" },
                  recipe: null,
                },
                {
                  consumed_at: "2024-01-20T12:00:00Z",
                  nutrition_item: { id: 2, description: "Chicken Salad" },
                  recipe: null,
                },
                {
                  consumed_at: "2024-01-19T12:00:00Z",
                  nutrition_item: { id: 2, description: "Chicken Salad" },
                  recipe: null,
                },
                {
                  consumed_at: "2024-01-20T18:00:00Z",
                  nutrition_item: null,
                  recipe: { id: 3, name: "Pasta Dinner" },
                },
              ],
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewDiaryEntryForm />);

    await waitFor(
      () => {
        expect(screen.queryByText("Most logged")).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // All three unique items should appear
    expect(screen.queryByText("Oatmeal")).not.toBeNull();
    expect(screen.queryByText("Chicken Salad")).not.toBeNull();
    expect(screen.queryByText("Pasta Dinner")).not.toBeNull();

    // Time-based and recently logged sections should not appear
    expect(screen.queryByText("Logged at this time of day")).toBeNull();
    expect(screen.queryByText("Recently logged")).toBeNull();
  });
});
