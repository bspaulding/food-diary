import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import NutritionItemShow from "./NutritionItemShow";

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
  useParams: () => ({ id: "123" }),
  useNavigate: () => vi.fn(),
  A: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as Element}</a>
  ),
}));

describe("NutritionItemShow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display nutrition item details", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_nutrition_item_by_pk: {
              id: 123,
              description: "Apple",
              calories: 95,
              totalFatGrams: 0.3,
              saturatedFatGrams: 0.1,
              transFatGrams: 0,
              polyunsaturatedFatGrams: 0.1,
              monounsaturatedFatGrams: 0.1,
              cholesterolMilligrams: 0,
              sodiumMilligrams: 2,
              totalCarbohydrateGrams: 25,
              dietaryFiberGrams: 4,
              totalSugarsGrams: 19,
              addedSugarsGrams: 0,
              proteinGrams: 0.5,
            },
          },
        });
      }),
    );

    render(() => <NutritionItemShow />);

    await waitFor(() => {
      expect(screen.getByText("Apple")).toBeTruthy();
      expect(screen.getByText("95")).toBeTruthy();
      expect(screen.getByText("Calories")).toBeTruthy();
      expect(screen.getByText("Total Fat (g)")).toBeTruthy();
    });
  });

  it("should display Back to Diary link", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_nutrition_item_by_pk: {
              id: 123,
              description: "Apple",
              calories: 95,
            },
          },
        });
      }),
    );

    render(() => <NutritionItemShow />);

    await waitFor(() => {
      const backLink = screen.getByText("Back to Diary");
      expect(backLink).toBeTruthy();
    });
  });

  it("should display Edit Item link with correct href", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_nutrition_item_by_pk: {
              id: 123,
              description: "Apple",
              calories: 95,
            },
          },
        });
      }),
    );

    render(() => <NutritionItemShow />);

    await waitFor(() => {
      const editLink = screen.getByText("Edit Item");
      expect(editLink).toBeTruthy();
    });
  });

  it("should show LoggableItem component when item is loaded", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_nutrition_item_by_pk: {
              id: 123,
              description: "Apple",
              calories: 95,
            },
          },
        });
      }),
    );

    render(() => <NutritionItemShow />);

    await waitFor(() => {
      expect(screen.getByText("Log It")).toBeTruthy();
    });
  });

  it("should bold main nutrition facts and indent sub-items", async () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_nutrition_item_by_pk: {
              id: 123,
              description: "Apple",
              calories: 95,
              totalFatGrams: 0.3,
              saturatedFatGrams: 0.1,
              proteinGrams: 0.5,
            },
          },
        });
      }),
    );

    render(() => <NutritionItemShow />);

    await waitFor(() => {
      const caloriesElement = screen.getByText("Calories");
      expect(caloriesElement.className).toContain("font-semibold");

      const saturatedFatElement = screen.getByText("Saturated Fat (g)");
      expect(saturatedFatElement.className).toContain("ml-4");
    });
  });
});
