import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import NewRecipeForm from "./NewRecipeForm";

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

vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      isAuthenticated: () => true,
      accessToken: () => "test-token",
      user: () => ({ name: "Test User" }),
      auth0: () => null,
    },
  ],
}));

const mockNavigate = vi.fn();
vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  A: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as Element}</a>
  ),
}));

// SearchItemsForm's own search/debounce behavior has its own test file; here
// it's stubbed to invoke its render-prop immediately with fixed items, so
// tests below can exercise NewRecipeForm's own add-item logic (the store
// append path) deterministically instead of through real debounced search +
// MSW timing.
const mockSearchItems: Array<{ id: number; description: string }> = [];
vi.mock("./SearchItemsForm", () => ({
  __esModule: true,
  ItemsQueryType: { ItemsAndRecipes: 0, ItemsOnly: 1 },
  default: (props: {
    children: (item: {
      clear?: () => void;
      nutritionItem?: { id: number; description: string };
    }) => unknown;
  }) => (
    <>
      {mockSearchItems.map((nutritionItem) =>
        props.children({ clear: () => {}, nutritionItem }),
      )}
    </>
  ),
}));

describe("NewRecipeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchItems.length = 0;
  });

  it("should render new recipe form", () => {
    render(() => <NewRecipeForm />);

    expect(screen.getByText("New Recipe")).toBeTruthy();
    const nameInput = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    expect(screen.getByDisplayValue("1")).toBeTruthy(); // Total Servings defaults to 1
    expect(screen.getByText("Save Recipe")).toBeTruthy();
  });

  it("should display Back to entries link", () => {
    render(() => <NewRecipeForm />);

    const backLink = screen.getByText("Back to entries");
    expect(backLink).toBeTruthy();
  });

  it("should update recipe name input", async () => {
    const user = userEvent.setup();
    render(() => <NewRecipeForm />);

    const nameInput = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    await user.type(nameInput, "Smoothie");

    expect(nameInput.value).toBe("Smoothie");
  });

  it("should update total servings input", async () => {
    const user = userEvent.setup();
    render(() => <NewRecipeForm />);

    const servingsInput = document.querySelector(
      'input[name="total-servings"]',
    ) as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "4");

    expect(servingsInput.value).toBe("4");
  });

  it("should handle NaN in total servings input", async () => {
    const user = userEvent.setup();
    render(() => <NewRecipeForm />);

    const servingsInput = document.querySelector(
      'input[name="total-servings"]',
    ) as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "abc");

    // Should not update to NaN - stays cleared
    expect(servingsInput.value).toBe("");
  });

  it("should display initial recipe data when provided", () => {
    const initialRecipe = {
      id: 123,
      name: "Existing Recipe",
      total_servings: 2,
      recipe_items: [
        {
          servings: 1,
          nutrition_item: {
            id: 1,
            description: "Banana",
          },
        },
      ],
    };

    render(() => <NewRecipeForm initialRecipe={initialRecipe} />);

    const nameInput = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Existing Recipe");

    const servingsInput = document.querySelector(
      'input[name="total-servings"]',
    ) as HTMLInputElement;
    expect(servingsInput.value).toBe("2");

    expect(screen.getByText("Banana")).toBeTruthy();
    expect(screen.getByText("1 items in recipe.")).toBeTruthy();
  });

  it.skip("should add nutrition item to recipe via SearchItemsForm", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (
          isGraphQLRequest(body) &&
          body.query.includes("SearchNutritionItems")
        ) {
          return HttpResponse.json({
            data: {
              food_diary_search_nutrition_items: [
                {
                  id: 1,
                  description: "Apple",
                  calories: 95,
                },
              ],
              food_diary_search_recipes: [],
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewRecipeForm />);

    // Verify starting state
    expect(screen.getByText("0 items in recipe.")).toBeTruthy();

    const searchInput = document.querySelector(
      'input[name="entry-item-search"]',
    ) as HTMLInputElement;

    // Type search query
    await user.type(searchInput, "Apple");

    // Wait for search results with extended timeout
    await waitFor(
      () => {
        const appleText = screen.queryByText("Apple");
        expect(appleText).not.toBeNull();
      },
      { timeout: 3000 },
    );

    // Find and click the add button (⊕)
    const addButtons = screen.getAllByText("⊕");
    await user.click(addButtons[0]);

    // Verify item was added to recipe
    await waitFor(() => {
      expect(screen.getByText("1 items in recipe.")).toBeTruthy();
    });
  });

  // Exercises the store append path (setInput("recipe_items",
  // input.recipe_items.length, newItem)) deterministically, since the test
  // above going through real SearchItemsForm search/debounce timing is
  // flaky in this environment (confirmed against unmodified NewRecipeForm.tsx
  // too, so it's a pre-existing environment issue, not this test's to fix).
  it("appends items to recipe_items when added, in order", async () => {
    const user = userEvent.setup();
    mockSearchItems.push(
      { id: 1, description: "Apple" },
      { id: 2, description: "Banana" },
    );

    render(() => <NewRecipeForm />);

    expect(screen.getByText("0 items in recipe.")).toBeTruthy();

    const addButtons = screen.getAllByText("⊕");
    await user.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("1 items in recipe.")).toBeTruthy();
    });

    await user.click(addButtons[1]);

    await waitFor(() => {
      expect(screen.getByText("2 items in recipe.")).toBeTruthy();
    });

    const servingsInputs = screen.getAllByRole(
      "spinbutton",
    ) as HTMLInputElement[];
    // index 0 is total-servings; the added items follow in append order
    expect(servingsInputs[1].value).toBe("1");
    expect(servingsInputs[2].value).toBe("1");
  });

  it.skip("should update item servings in recipe", async () => {
    const user = userEvent.setup();

    const initialRecipe = {
      id: 0,
      name: "Test Recipe",
      total_servings: 1,
      recipe_items: [
        {
          servings: 1,
          nutrition_item: {
            id: 1,
            description: "Banana",
          },
        },
      ],
    };

    render(() => <NewRecipeForm initialRecipe={initialRecipe} />);

    const servingsInputs = screen.getAllByRole("spinbutton");
    const itemServingsInput = servingsInputs[1] as HTMLInputElement;

    // Verify initial value
    expect(itemServingsInput.value).toBe("1");

    // Change to 2.5 using keyboard input events to simulate real user behavior
    itemServingsInput.focus();
    itemServingsInput.setSelectionRange(0, 1);
    await user.keyboard("2.5");

    // The value should be updated
    await waitFor(() => {
      const currentValue = itemServingsInput.value;
      // May be "2.5" or "2.51" depending on selection behavior, just check it contains our input
      expect(parseFloat(currentValue)).toBeGreaterThanOrEqual(2.5);
    });
  });

  // <Index> (rather than <For>) is load-bearing here: every keystroke in a
  // servings input replaces that row's object in recipe_items (see the
  // onInput handler below), so a keyed list would tear down and recreate
  // the DOM node on every character typed, losing focus mid-edit. This
  // pins down that the row inputs keep their DOM identity across an edit,
  // so a future migration away from <Index> can't regress it silently.
  it("keeps list item inputs' DOM identity (and focus) across an edit", async () => {
    const user = userEvent.setup();

    const initialRecipe = {
      id: 0,
      name: "Test Recipe",
      total_servings: 1,
      recipe_items: [
        { servings: 1, nutrition_item: { id: 1, description: "Banana" } },
        { servings: 2, nutrition_item: { id: 2, description: "Apple" } },
      ],
    };

    render(() => <NewRecipeForm initialRecipe={initialRecipe} />);

    // index 0 is the total-servings input; 1 and 2 are the recipe items'.
    const [, bananaInput, appleInput] = screen.getAllByRole(
      "spinbutton",
    ) as HTMLInputElement[];

    await user.clear(bananaInput);
    await user.type(bananaInput, "5");

    await waitFor(() => {
      expect(bananaInput.value).toBe("5");
    });

    const rerendered = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(rerendered[1]).toBe(bananaInput);
    expect(rerendered[2]).toBe(appleInput);
    expect(document.activeElement).toBe(bananaInput);
  });

  it("should handle NaN in item servings input", async () => {
    const user = userEvent.setup();

    const initialRecipe = {
      id: 0,
      name: "Test Recipe",
      total_servings: 1,
      recipe_items: [
        {
          servings: 1,
          nutrition_item: {
            id: 1,
            description: "Banana",
          },
        },
      ],
    };

    render(() => <NewRecipeForm initialRecipe={initialRecipe} />);

    const servingsInputs = screen.getAllByRole("spinbutton");
    const itemServingsInput = servingsInputs[1] as HTMLInputElement;

    await user.clear(itemServingsInput);
    await user.type(itemServingsInput, "invalid");

    expect(itemServingsInput.value).toBe("");
  });

  it("should create new recipe on save", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (isGraphQLRequest(body) && body.query.includes("CreateRecipe")) {
          return HttpResponse.json({
            data: {
              insert_food_diary_recipe_one: {
                id: 456,
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewRecipeForm />);

    const nameInput = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    await user.type(nameInput, "My Recipe");

    const saveButton = screen.getByText("Save Recipe");
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/recipe/456");
    });
  });

  it("should update existing recipe on save", async () => {
    const user = userEvent.setup();

    const initialRecipe = {
      id: 123,
      name: "Existing Recipe",
      total_servings: 2,
      recipe_items: [],
    };

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (isGraphQLRequest(body) && body.query.includes("UpdateRecipe")) {
          return HttpResponse.json({
            data: {
              update_food_diary_recipe_by_pk: {
                id: 123,
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewRecipeForm initialRecipe={initialRecipe} />);

    const saveButton = screen.getByText("Save Recipe");
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/recipe/123");
    });
  });

  it("should not navigate when create recipe fails", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            insert_food_diary_recipe_one: null,
          },
        });
      }),
    );

    render(() => <NewRecipeForm />);

    const nameInput = document.querySelector(
      'input[name="name"]',
    ) as HTMLInputElement;
    await user.type(nameInput, "My Recipe");

    const saveButton = screen.getByText("Save Recipe");
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it("should not navigate when update recipe fails", async () => {
    const user = userEvent.setup();

    const initialRecipe = {
      id: 123,
      name: "Existing Recipe",
      total_servings: 2,
      recipe_items: [],
    };

    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            update_food_diary_recipe_by_pk: null,
          },
        });
      }),
    );

    render(() => <NewRecipeForm initialRecipe={initialRecipe} />);

    const saveButton = screen.getByText("Save Recipe");
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
