import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import DiaryList from "./DiaryList";

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

describe("DiaryList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render navigation buttons", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [],
            current_week: { aggregate: { sum: { calories: 0 } } },
            past_four_weeks: { aggregate: { sum: { calories: 0 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      expect(screen.getByText("Add New Entry")).toBeTruthy();
      expect(screen.getByText("Add Item")).toBeTruthy();
      expect(screen.getByText("Add Recipe")).toBeTruthy();
    });
  });

  it("should show empty state when no entries", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [],
            current_week: { aggregate: { sum: { calories: 0 } } },
            past_four_weeks: { aggregate: { sum: { calories: 0 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      expect(screen.getByText("No entries, yet...")).toBeTruthy();
    });
  });

  it("should display weekly stats", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [],
            current_week: { aggregate: { sum: { calories: 14000 } } },
            past_four_weeks: { aggregate: { sum: { calories: 56000 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      expect(screen.getByText("Last 7 Days")).toBeTruthy();
      expect(screen.getByText("4 Week Avg")).toBeTruthy();
      expect(screen.getByText("View Trends")).toBeTruthy();
    });
  });

  it("should display diary entries grouped by day", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 200,
                nutrition_item: {
                  id: 1,
                  description: "Apple",
                  calories: 95,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 2.4,
                },
                recipe: null,
              },
              {
                id: 2,
                consumed_at: "2024-01-15T14:00:00Z",
                servings: 2,
                calories: 300,
                nutrition_item: {
                  id: 2,
                  description: "Banana",
                  calories: 105,
                  protein_grams: 1.3,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.4,
                  dietary_fiber_grams: 3.1,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 500 } } },
            past_four_weeks: { aggregate: { sum: { calories: 2000 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      expect(screen.getByText("Apple")).toBeTruthy();
      expect(screen.getByText("Banana")).toBeTruthy();
    });
  });

  it("should display recipe entries with RECIPE badge", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 300,
                nutrition_item: null,
                recipe: {
                  id: 1,
                  name: "Smoothie",
                  recipe_items: [
                    {
                      servings: 1,
                      nutrition_item: {
                        id: 1,
                        description: "Banana",
                        calories: 105,
                        protein_grams: 1.3,
                        added_sugars_grams: 0,
                        total_fat_grams: 0.4,
                        dietary_fiber_grams: 3.1,
                      },
                    },
                  ],
                },
              },
            ],
            current_week: { aggregate: { sum: { calories: 300 } } },
            past_four_weeks: { aggregate: { sum: { calories: 1200 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      expect(screen.getByText("Smoothie")).toBeTruthy();
      expect(screen.getByText("RECIPE")).toBeTruthy();
    });
  });

  it("should calculate and display daily totals", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 2,
                calories: 200,
                nutrition_item: {
                  id: 1,
                  description: "Apple",
                  calories: 100,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 2.4,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 200 } } },
            past_four_weeks: { aggregate: { sum: { calories: 800 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      expect(screen.getByText("200")).toBeTruthy();
      expect(screen.getByText("KCAL")).toBeTruthy();
    });
  });

  it("should display fiber totals in summary row", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 95,
                nutrition_item: {
                  id: 1,
                  description: "Apple",
                  calories: 95,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 4,
                },
                recipe: null,
              },
              {
                id: 2,
                consumed_at: "2024-01-15T14:00:00Z",
                servings: 2,
                calories: 210,
                nutrition_item: {
                  id: 2,
                  description: "Banana",
                  calories: 105,
                  protein_grams: 1.3,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.4,
                  dietary_fiber_grams: 3,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 305 } } },
            past_four_weeks: { aggregate: { sum: { calories: 1220 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    // Fiber total: 1*4 + 2*3 = 10
    await waitFor(() => {
      expect(screen.getByText("Fiber")).toBeTruthy();
      expect(screen.getByText(/^10\s*g$/)).toBeTruthy();
    });
  });

  it("should delete entry when delete button is clicked", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body && body.query && body.query.includes("DeleteDiaryEntry")) {
          return HttpResponse.json({
            data: {
              delete_food_diary_diary_entry_by_pk: {
                id: 1,
              },
            },
          });
        }
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 200,
                nutrition_item: {
                  id: 1,
                  description: "Apple",
                  calories: 95,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 2.4,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 200 } } },
            past_four_weeks: { aggregate: { sum: { calories: 800 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      expect(screen.getByText("Apple")).toBeTruthy();
    });

    const deleteButton = screen.getByText("Delete");
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText("Apple")).toBeFalsy();
    });
  });

  it.skip("should handle delete error and restore entry", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body && body.query && body.query.includes("DeleteDiaryEntry")) {
          // Return success but with no data (simulating error case in lines 290-292)
          return HttpResponse.json({
            data: null,
          });
        }
        // Return entries for GetEntries query
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 200,
                nutrition_item: {
                  id: 1,
                  description: "Apple",
                  calories: 95,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 2.4,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 200 } } },
            past_four_weeks: { aggregate: { sum: { calories: 800 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    // Wait for entry to load
    await waitFor(() => {
      expect(screen.queryByText("Apple")).not.toBeNull();
    });

    const deleteButton = screen.getByText("Delete");
    await user.click(deleteButton);

    // Entry should be removed optimistically then restored
    await waitFor(() => {
      // Entry should be back after restore
      expect(screen.queryByText("Apple")).not.toBeNull();
    });

    consoleError.mockRestore();
  });

  it.skip("should handle delete exception and log error", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body = (await request.json()) as { query?: string };
        if (body && body.query && body.query.includes("DeleteDiaryEntry")) {
          // Throw network error to trigger catch block
          return HttpResponse.error();
        }
        // Return entries for GetEntries query
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 200,
                nutrition_item: {
                  id: 1,
                  description: "Apple",
                  calories: 95,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 2.4,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 200 } } },
            past_four_weeks: { aggregate: { sum: { calories: 800 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    // Wait for entry to load
    await waitFor(() => {
      expect(screen.queryByText("Apple")).not.toBeNull();
    });

    const deleteButton = screen.getByText("Delete");
    await user.click(deleteButton);

    // Wait for console.error to be called
    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to delete entry: ",
        expect.anything(),
      );
    });

    consoleError.mockRestore();
  });

  it("should link to nutrition item page", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 200,
                nutrition_item: {
                  id: 123,
                  description: "Apple",
                  calories: 95,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 2.4,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 200 } } },
            past_four_weeks: { aggregate: { sum: { calories: 800 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      const appleLink = screen.getByText("Apple") as HTMLAnchorElement;
      expect(appleLink.href).toContain("/nutrition_item/123");
    });
  });

  it("should link to recipe page for recipe entries", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 300,
                nutrition_item: null,
                recipe: {
                  id: 456,
                  name: "Smoothie",
                  recipe_items: [],
                },
              },
            ],
            current_week: { aggregate: { sum: { calories: 300 } } },
            past_four_weeks: { aggregate: { sum: { calories: 1200 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      const smoothieLink = screen.getByText("Smoothie") as HTMLAnchorElement;
      expect(smoothieLink.href).toContain("/recipe/456");
    });
  });

  it("should display Edit link for each entry", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 999,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 1,
                calories: 200,
                nutrition_item: {
                  id: 1,
                  description: "Apple",
                  calories: 95,
                  protein_grams: 0.5,
                  added_sugars_grams: 0,
                  total_fat_grams: 0.3,
                  dietary_fiber_grams: 2.4,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 200 } } },
            past_four_weeks: { aggregate: { sum: { calories: 800 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      const editLink = screen.getByText("Edit") as HTMLAnchorElement;
      expect(editLink.href).toContain("/diary_entry/999/edit");
    });
  });

  it("should calculate macro totals correctly for recipes", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 1,
                consumed_at: "2024-01-15T10:30:00Z",
                servings: 2,
                calories: 600,
                nutrition_item: null,
                recipe: {
                  id: 1,
                  name: "Smoothie",
                  recipe_items: [
                    {
                      servings: 1,
                      nutrition_item: {
                        id: 1,
                        description: "Banana",
                        calories: 105,
                        protein_grams: 1.3,
                        added_sugars_grams: 0,
                        total_fat_grams: 0.4,
                        dietary_fiber_grams: 3.1,
                      },
                    },
                    {
                      servings: 1,
                      nutrition_item: {
                        id: 2,
                        description: "Yogurt",
                        calories: 150,
                        protein_grams: 5,
                        added_sugars_grams: 10,
                        total_fat_grams: 3,
                        dietary_fiber_grams: 0,
                      },
                    },
                  ],
                },
              },
            ],
            current_week: { aggregate: { sum: { calories: 600 } } },
            past_four_weeks: { aggregate: { sum: { calories: 2400 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      // Should show protein from recipe items: 2 * (1.3 + 5) = 12.6
      expect(screen.getByText(/12.6g protein/)).toBeTruthy();
    });
  });

  it("should sort entries by time within a day", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [
              {
                id: 2,
                consumed_at: "2024-01-15T14:00:00Z",
                servings: 1,
                calories: 200,
                nutrition_item: {
                  id: 2,
                  description: "Lunch",
                  calories: 200,
                  protein_grams: 10,
                  added_sugars_grams: 0,
                  total_fat_grams: 5,
                  dietary_fiber_grams: 2,
                },
                recipe: null,
              },
              {
                id: 1,
                consumed_at: "2024-01-15T08:00:00Z",
                servings: 1,
                calories: 150,
                nutrition_item: {
                  id: 1,
                  description: "Breakfast",
                  calories: 150,
                  protein_grams: 5,
                  added_sugars_grams: 0,
                  total_fat_grams: 3,
                  dietary_fiber_grams: 4,
                },
                recipe: null,
              },
            ],
            current_week: { aggregate: { sum: { calories: 350 } } },
            past_four_weeks: { aggregate: { sum: { calories: 1400 } } },
          },
        });
      }),
    );

    render(() => <DiaryList />);

    await waitFor(() => {
      const entries = screen.getAllByRole("listitem");
      // Breakfast should appear before Lunch
      expect(entries[0].textContent).toContain("Breakfast");
    });
  });
});
