import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { Router, Route } from "@solidjs/router";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import App from "./App";
import Trends from "./Trends";
import DiaryList from "./DiaryList";
import userEvent from "@testing-library/user-event";

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

describe("Trends", () => {
  it("should display trends page with no data message when there are no entries", async () => {
    // Set up empty response for trends
    server.use(
      http.post("*/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (!isGraphQLRequest(body)) {
          return HttpResponse.json({
            errors: [{ message: "Invalid request" }],
          });
        }
        const query: string = body.query;
        if (query.includes("GetWeeklyTrends")) {
          return HttpResponse.json({
            data: {
              food_diary_trends_weekly: [],
            },
          });
        }
        if (query.includes("GetEntries")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry: [],
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => (
      <Router root={App}>
        <Route path="/" component={Trends} />
      </Router>
    ));

    await waitFor(
      () => {
        const header = screen.queryByText(/Weekly Nutrition Trends/i);
        expect(header).not.toBeNull();
      },
      { timeout: 5000 },
    );

    expect(screen.getByText(/Weekly Nutrition Trends/i)).toBeTruthy();
    expect(
      screen.getByText(
        /No data available yet. Add some diary entries to see trends!/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Back to Diary/i)).toBeTruthy();
  });

  it("should display trends charts when there is data", async () => {
    // Mock data with weekly aggregated trends from backend
    const mockTrendsData = [
      {
        week_of_year: "2024-01-01",
        calories: 1900,
        protein: 47.5,
        added_sugar: 27.5,
      },
      {
        week_of_year: "2024-01-08",
        calories: 2200,
        protein: 60,
        added_sugar: 35,
      },
    ];

    server.use(
      http.post("*/api/v1/graphql", async ({ request }): Promise<Response> => {
        const body: unknown = await request.json();
        if (!isGraphQLRequest(body)) {
          return HttpResponse.json({
            errors: [{ message: "Invalid request" }],
          });
        }
        const query: string = body.query || "";

        if (query.includes("GetWeeklyTrends")) {
          return HttpResponse.json({
            data: {
              food_diary_trends_weekly: mockTrendsData,
            },
          });
        }

        // Fallback for any other queries
        return HttpResponse.json({
          data: {
            food_diary_diary_entry: [],
          },
        });
      }),
    );

    render(() => (
      <Router root={App}>
        <Route path="/" component={Trends} />
      </Router>
    ));

    // Wait for data to load and charts to render
    await waitFor(
      () => {
        const chartLabel = screen.queryByText(/Average Daily Calories/i);
        expect(chartLabel).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify charts are displayed
    expect(screen.getByText(/Average Daily Calories/i)).toBeTruthy();
    expect(screen.getByText(/Average Daily Protein/i)).toBeTruthy();
    expect(screen.getByText(/Average Daily Added Sugar/i)).toBeTruthy();

    // Verify no empty state message
    expect(screen.queryByText(/No data available yet/i)).toBeNull();
  });

  it("should have View Trends link on DiaryList page", async () => {
    server.use(
      http.post("*/api/v1/graphql", async ({ request }): Promise<Response> => {
        const body: unknown = await request.json();
        if (!isGraphQLRequest(body)) {
          return HttpResponse.json({
            errors: [{ message: "Invalid request" }],
          });
        }
        const query: string = body.query;
        if (query.includes("GetEntries")) {
          return HttpResponse.json({
            data: {
              food_diary_diary_entry: [],
            },
          });
        }
        if (query.includes("GetWeeklyStats")) {
          return HttpResponse.json({
            data: {
              current_week: {
                aggregate: {
                  sum: {
                    calories: 1500,
                  },
                },
              },
              past_four_weeks: {
                aggregate: {
                  sum: {
                    calories: 10000,
                  },
                },
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => (
      <Router root={App}>
        <Route path="/" component={DiaryList} />
      </Router>
    ));

    await waitFor(
      () => {
        const viewTrendsLink = screen.queryByText(/View Trends/i);
        expect(viewTrendsLink).not.toBeNull();
      },
      { timeout: 5000 },
    );

    expect(screen.getByText(/View Trends/i)).toBeTruthy();
    const viewTrendsLink = screen.getByText(/View Trends/i).closest("a");
    expect(viewTrendsLink?.getAttribute("href")).toBe("/trends");
  });
});
