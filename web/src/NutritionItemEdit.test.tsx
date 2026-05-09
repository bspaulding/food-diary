import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import NutritionItemEdit from "./NutritionItemEdit";

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

describe("NutritionItemEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should load and display nutrition item edit form", async () => {
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

    render(() => <NutritionItemEdit />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Apple")).toBeTruthy();
    });
  });

  it("should not display form when nutrition item is not loaded", () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_nutrition_item_by_pk: null,
          },
        });
      }),
    );

    render(() => <NutritionItemEdit />);

    expect(screen.queryByRole("form")).toBeFalsy();
  });
});
