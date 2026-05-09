import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import RecipeShow from "./RecipeShow";

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

vi.mock("@solidjs/router", () => ({
  useParams: () => ({ id: "456" }),
  useNavigate: () => vi.fn(),
  A: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as Element}</a>
  ),
}));

describe("RecipeShow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display recipe details", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 2,
              recipe_items: [
                {
                  servings: 1,
                  nutrition_item: {
                    id: 1,
                    description: "Banana",
                    calories: 105,
                  },
                },
                {
                  servings: 1,
                  nutrition_item: {
                    id: 2,
                    description: "Yogurt",
                    calories: 150,
                  },
                },
              ],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      expect(screen.getByText("Smoothie")).toBeTruthy();
      expect(screen.getByText("Banana")).toBeTruthy();
      expect(screen.getByText("Yogurt")).toBeTruthy();
    });
  });

  it("should calculate and display total calories", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 2,
              recipe_items: [
                {
                  servings: 2,
                  nutrition_item: {
                    id: 1,
                    description: "Banana",
                    calories: 105,
                  },
                },
                {
                  servings: 1,
                  nutrition_item: {
                    id: 2,
                    description: "Yogurt",
                    calories: 150,
                  },
                },
              ],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      // 2 * 105 + 1 * 150 = 360
      expect(screen.getByText(/Total Calories: 360 kcal/)).toBeTruthy();
    });
  });

  it("should calculate and display calories per serving", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 2,
              recipe_items: [
                {
                  servings: 2,
                  nutrition_item: {
                    id: 1,
                    description: "Banana",
                    calories: 105,
                  },
                },
              ],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      // 2 * 105 / 2 = 105
      expect(screen.getByText(/Calories per Serving: 105 kcal/)).toBeTruthy();
    });
  });

  it("should handle recipe with zero total servings", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 0,
              recipe_items: [
                {
                  servings: 1,
                  nutrition_item: {
                    id: 1,
                    description: "Banana",
                    calories: 100,
                  },
                },
              ],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      // Should default to 1 serving when total_servings is 0
      expect(screen.getByText(/Calories per Serving: 100 kcal/)).toBeTruthy();
    });
  });

  it("should handle recipe items without calories", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 1,
              recipe_items: [
                {
                  servings: 1,
                  nutrition_item: {
                    id: 1,
                    description: "Water",
                  },
                },
              ],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      expect(screen.getByText(/Total Calories: 0 kcal/)).toBeTruthy();
      expect(screen.getByText(/Calories per Serving: 0 kcal/)).toBeTruthy();
    });
  });

  it("should display Back to Diary link", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 1,
              recipe_items: [],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      const backLink = screen.getByText("Back to Diary");
      expect(backLink).toBeTruthy();
    });
  });

  it("should display Edit Recipe link", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 1,
              recipe_items: [],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      const editLink = screen.getByText("Edit Recipe");
      expect(editLink).toBeTruthy();
    });
  });

  it("should show LoggableItem component when recipe is loaded", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 1,
              recipe_items: [],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      expect(screen.getByText("Log It")).toBeTruthy();
    });
  });

  it("should display fallback message when no recipe items", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Empty Recipe",
              total_servings: 1,
              recipe_items: [],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      expect(screen.getByText("No recipe items.")).toBeTruthy();
    });
  });

  it("should display calories per ingredient", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: {
              id: 456,
              name: "Smoothie",
              total_servings: 1,
              recipe_items: [
                {
                  servings: 2,
                  nutrition_item: {
                    id: 1,
                    description: "Banana",
                    calories: 105,
                  },
                },
              ],
            },
          },
        });
      }),
    );

    render(() => <RecipeShow />);

    await waitFor(() => {
      // 2 servings * 105 = 210 kcal
      expect(screen.getByText(/2 servings - 210 kcal/)).toBeTruthy();
    });
  });
});
