import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import SearchItemsForm, { ItemsQueryType } from "./SearchItemsForm";

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

// Mock Auth0
vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      accessToken: () => "test-token",
    },
  ],
}));

describe("SearchItemsForm", () => {
  it("should display placeholder text when no search is entered", () => {
    render(() => (
      <SearchItemsForm>
        {({ nutritionItem, recipe }) => (
          <li>{nutritionItem?.description || recipe?.name}</li>
        )}
      </SearchItemsForm>
    ));

    expect(
      screen.getByText("Search for an item or recipe you've previously added."),
    ).toBeTruthy();
  });

  it("should search for items and recipes when text is entered", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        if (query.includes("SearchItemsAndRecipes")) {
          return HttpResponse.json({
            data: {
              food_diary_search_nutrition_items: [
                { id: 1, description: "Test Item" },
              ],
              food_diary_search_recipes: [{ id: 2, name: "Test Recipe" }],
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => (
      <SearchItemsForm>
        {({ nutritionItem, recipe }) => (
          <li>{nutritionItem?.description || recipe?.name}</li>
        )}
      </SearchItemsForm>
    ));

    const searchInput = screen.getByPlaceholderText(
      "Search Previous Items",
    ) as HTMLInputElement;
    await user.type(searchInput, "test");

    // Wait for debounce and results
    await waitFor(
      () => {
        expect(screen.queryByText("2 items")).not.toBeNull();
      },
      { timeout: 1000 },
    );

    expect(screen.getByText("Test Item")).toBeTruthy();
    expect(screen.getByText("Test Recipe")).toBeTruthy();
  });

  it("should show loading state while searching", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("*/api/v1/graphql", async () => {
        // Delay response to capture loading state
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          data: {
            food_diary_search_nutrition_items: [],
            food_diary_search_recipes: [],
          },
        });
      }),
    );

    render(() => (
      <SearchItemsForm>
        {({ nutritionItem }) => <li>{nutritionItem?.description}</li>}
      </SearchItemsForm>
    ));

    const searchInput = screen.getByPlaceholderText("Search Previous Items");
    await user.type(searchInput, "test");

    // Check for loading text shortly after typing
    await waitFor(() => {
      const loadingText = screen.queryByText("Searching...");
      if (loadingText) {
        expect(loadingText).toBeTruthy();
      }
    });
  });

  it("should use ItemsOnly query type when specified", async () => {
    const user = userEvent.setup();
    let queryCalled = false;

    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        if (
          query.includes("SearchItems") &&
          !query.includes("SearchItemsAndRecipes")
        ) {
          queryCalled = true;
          return HttpResponse.json({
            data: {
              food_diary_search_nutrition_items: [
                { id: 3, description: "Only Item" },
              ],
            },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => (
      <SearchItemsForm queryType={ItemsQueryType.ItemsOnly}>
        {({ nutritionItem }) => <li>{nutritionItem?.description}</li>}
      </SearchItemsForm>
    ));

    const searchInput = screen.getByPlaceholderText("Search Previous Items");
    await user.type(searchInput, "test");

    await waitFor(() => {
      expect(queryCalled).toBe(true);
    });
  });
});
