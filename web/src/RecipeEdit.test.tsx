import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import RecipeEdit from "./RecipeEdit";

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

describe("RecipeEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should load and display recipe edit form", async () => {
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
                  },
                },
              ],
            },
          },
        });
      }),
    );

    render(() => <RecipeEdit />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Smoothie")).toBeTruthy();
    });
  });

  it("should not display form when recipe is not loaded", () => {
    server.use(
      http.post("/api/v1/graphql", () => {
        return HttpResponse.json({
          data: {
            food_diary_recipe_by_pk: null,
          },
        });
      }),
    );

    render(() => <RecipeEdit />);

    expect(screen.queryByRole("form")).toBeFalsy();
  });
});
