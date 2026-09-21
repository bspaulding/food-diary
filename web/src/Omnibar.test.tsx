import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import Omnibar from "./Omnibar";

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

vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      accessToken: () => "test-token",
    },
  ],
}));

const mockNavigate = vi.fn();
vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
}));

describe("Omnibar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render a search input", () => {
    render(() => <Omnibar />);
    expect(
      screen.getByPlaceholderText("Search items and recipes..."),
    ).toBeTruthy();
  });

  it("should not show a results panel until a query is entered", async () => {
    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText("Search items and recipes...");
    await userEvent.setup().click(input);

    expect(screen.queryByText("RECIPE")).toBeNull();
    expect(screen.queryByText("ITEM")).toBeNull();
  });

  it("should show up to 3 results, ordered by score", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";
        if (query.includes("SearchItemsAndRecipes")) {
          return HttpResponse.json({
            data: {
              food_diary_search_all: [
                {
                  type: "item",
                  nutrition_item: { id: 1, description: "Apple" },
                  recipe: null,
                },
                {
                  type: "item",
                  nutrition_item: { id: 2, description: "Banana" },
                  recipe: null,
                },
                {
                  type: "recipe",
                  nutrition_item: null,
                  recipe: { id: 3, name: "Fruit Salad" },
                },
                {
                  type: "item",
                  nutrition_item: { id: 4, description: "Cherry" },
                  recipe: null,
                },
              ],
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText("Search items and recipes...");
    await user.click(input);
    await user.type(input, "fruit");

    await waitFor(
      () => {
        expect(screen.queryByText("Apple")).not.toBeNull();
      },
      { timeout: 1000 },
    );

    expect(screen.getByText("Apple")).toBeTruthy();
    expect(screen.getByText("Banana")).toBeTruthy();
    expect(screen.getByText("Fruit Salad")).toBeTruthy();
    expect(screen.queryByText("Cherry")).toBeNull();
  });

  it("should label item and recipe results", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("*/api/v1/graphql", async () => {
        return HttpResponse.json({
          data: {
            food_diary_search_all: [
              {
                type: "item",
                nutrition_item: { id: 1, description: "Apple" },
                recipe: null,
              },
              {
                type: "recipe",
                nutrition_item: null,
                recipe: { id: 3, name: "Fruit Salad" },
              },
            ],
          },
        });
      }),
    );

    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText("Search items and recipes...");
    await user.click(input);
    await user.type(input, "fruit");

    await waitFor(() => {
      expect(screen.queryByText("Apple")).not.toBeNull();
    });

    expect(screen.getByText("ITEM")).toBeTruthy();
    expect(screen.getByText("RECIPE")).toBeTruthy();
  });

  it("should log a nutrition item result inline via the LoggableItem UI", async () => {
    const user = userEvent.setup();
    let createEntryCalled = false;

    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        if (query.includes("SearchItemsAndRecipes")) {
          return HttpResponse.json({
            data: {
              food_diary_search_all: [
                {
                  type: "item",
                  nutrition_item: { id: 42, description: "Apple" },
                  recipe: null,
                },
              ],
            },
          });
        }

        if (query.includes("CreateDiaryEntry")) {
          createEntryCalled = true;
          const vars = isGraphQLRequest(body) ? body.variables : undefined;
          const entry = vars?.entry as {
            servings: number;
            nutrition_item_id: number;
          };
          expect(entry.servings).toBe(2.5);
          expect(entry.nutrition_item_id).toBe(42);
          return HttpResponse.json({
            data: { insert_food_diary_diary_entry_one: { id: 100 } },
          });
        }

        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText("Search items and recipes...");
    await user.click(input);
    await user.type(input, "apple");

    await waitFor(() => {
      expect(screen.queryByText("Apple")).not.toBeNull();
    });

    await user.click(screen.getByText("⊕"));

    await waitFor(() => {
      expect(screen.queryByText("Save")).not.toBeNull();
    });

    const servingsInput = screen.getByRole("spinbutton") as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "2.5");

    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(createEntryCalled).toBe(true);
    });

    // Logging inline never navigates away from the omnibar.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should keep the results panel open while logging (not close on the servings input blur)", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("*/api/v1/graphql", async () => {
        return HttpResponse.json({
          data: {
            food_diary_search_all: [
              {
                type: "item",
                nutrition_item: { id: 42, description: "Apple" },
                recipe: null,
              },
            ],
          },
        });
      }),
    );

    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText("Search items and recipes...");
    await user.click(input);
    await user.type(input, "apple");

    await waitFor(() => {
      expect(screen.queryByText("Apple")).not.toBeNull();
    });

    await user.click(screen.getByText("⊕"));

    const servingsInput = screen.getByRole("spinbutton") as HTMLInputElement;
    await user.click(servingsInput);

    // Focus has moved from the search input to the servings input inside
    // the panel; the panel (and the item it's logging) should still be
    // visible.
    expect(screen.getByText("Apple")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("should offer to add a new item or recipe when there are no results", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("*/api/v1/graphql", async () => {
        return HttpResponse.json({
          data: { food_diary_search_all: [] },
        });
      }),
    );

    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText("Search items and recipes...");
    await user.click(input);
    await user.type(input, "kombucha");

    await waitFor(() => {
      expect(screen.queryByText('⊕ Add "kombucha" as new item')).not.toBeNull();
    });

    expect(screen.getByText('⊕ Add "kombucha" as new recipe')).toBeTruthy();

    await user.click(screen.getByText('⊕ Add "kombucha" as new item'));

    expect(mockNavigate).toHaveBeenCalledWith(
      "/nutrition_item/new?description=kombucha",
    );
  });

  it("should navigate to the new recipe form prepopulated with the query", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("*/api/v1/graphql", async () => {
        return HttpResponse.json({
          data: { food_diary_search_all: [] },
        });
      }),
    );

    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText("Search items and recipes...");
    await user.click(input);
    await user.type(input, "kombucha");

    await waitFor(() => {
      expect(
        screen.queryByText('⊕ Add "kombucha" as new recipe'),
      ).not.toBeNull();
    });

    await user.click(screen.getByText('⊕ Add "kombucha" as new recipe'));

    expect(mockNavigate).toHaveBeenCalledWith("/recipe/new?name=kombucha");
  });

  it("should clear the search text when the clear button is clicked", async () => {
    const user = userEvent.setup();

    render(() => <Omnibar />);
    const input = screen.getByPlaceholderText(
      "Search items and recipes...",
    ) as HTMLInputElement;

    expect(screen.queryByLabelText("Clear search")).toBeNull();

    await user.type(input, "test");

    await waitFor(() => {
      expect(screen.getByLabelText("Clear search")).toBeTruthy();
    });

    await user.click(screen.getByLabelText("Clear search"));

    expect(input.value).toBe("");
  });
});
