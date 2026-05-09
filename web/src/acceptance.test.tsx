import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { Router, Route } from "@solidjs/router";
import type { Component } from "solid-js";
import { http, HttpResponse } from "msw";
import { worker } from "./test-setup-browser";
import App from "./App";
import DiaryList from "./DiaryList";
import NewDiaryEntryForm from "./NewDiaryEntryForm";
import NewNutritionItemForm from "./NewNutritionItemForm";
import NewRecipeForm from "./NewRecipeForm";
import userEvent from "@testing-library/user-event";

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

describe("Browser Acceptance Tests", () => {
  it("should view the diary list page", async () => {
    const user = userEvent.setup();

    render(() => (
      <Router root={App}>
        <Route path="/" component={DiaryList} />
      </Router>
    ));

    // Wait for the page to load
    await waitFor(
      () => {
        const banana = screen.queryByText(/Banana/i);
        expect(banana).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify diary list is displayed
    expect(screen.getByText(/Banana/i)).toBeTruthy();
    expect(screen.getByText(/105 kcal/i)).toBeTruthy();

    // Verify action buttons are present
    expect(screen.getByText("Add New Entry")).toBeTruthy();
    expect(screen.getByText("Add Item")).toBeTruthy();
    expect(screen.getByText("Add Recipe")).toBeTruthy();
  });

  it("should display weekly calorie summary stats", async () => {
    render(() => (
      <Router root={App}>
        <Route path="/" component={DiaryList} />
      </Router>
    ));

    // Wait for the page to load by checking for entries first
    await waitFor(
      () => {
        const banana = screen.queryByText(/Banana/i);
        expect(banana).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Wait for the weekly stats to be fetched and displayed
    await waitFor(
      () => {
        const last7DaysLabel = screen.queryByText(/LAST 7 DAYS/i);
        expect(last7DaysLabel).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify weekly summary labels are displayed
    expect(screen.getByText(/LAST 7 DAYS/i)).toBeTruthy();
    expect(screen.getByText(/4 WEEK AVG/i)).toBeTruthy();

    // Verify the weekly stats values are displayed with kcal/day units
    // The values are now averages per day, not totals
    // Both Last 7 Days and 4 Week Avg show 300 kcal/day in the mock data
    const kcalElements = screen.getAllByText(/300 kcal\/day/);
    expect(kcalElements).toHaveLength(2);
  });

  it("should display fiber on each diary entry stats line", async () => {
    render(() => (
      <Router root={App}>
        <Route path="/" component={DiaryList} />
      </Router>
    ));

    await waitFor(
      () => {
        expect(screen.queryByText(/Banana/i)).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Banana: 1 serving * 3.1g fiber
    expect(screen.getByText(/3\.1g fiber/i)).toBeTruthy();
  });

  it("should complete Add Item flow - create new item and log it", async () => {
    const user = userEvent.setup();

    render(() => (
      <Router root={App}>
        <Route path="/" component={DiaryList} />
        <Route
          path="/nutrition_item/new"
          component={NewNutritionItemForm as Component}
        />
        <Route
          path="/diary_entry/new"
          component={NewDiaryEntryForm as Component}
        />
      </Router>
    ));

    // Wait for diary list to load
    await waitFor(() => {
      expect(screen.queryByText("Add Item")).not.toBeNull();
    });

    // Navigate to Add Item
    const addItemButton = screen.getByText("Add Item");
    await user.click(addItemButton);

    // Wait for the form to load
    await waitFor(
      () => {
        // Check if we're on the add item page by looking for the form
        const descriptionInput = document.querySelector(
          'input[name="description"]',
        );
        expect(descriptionInput).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Fill in the nutrition item form
    const descriptionInput: HTMLInputElement | null = document.querySelector(
      'input[name="description"]',
    );
    if (descriptionInput) {
      await user.type(descriptionInput, "Test Protein Bar");
    }

    const caloriesInput: HTMLInputElement | null = document.querySelector(
      'input[name="calories"]',
    );
    if (caloriesInput) {
      await user.type(caloriesInput, "200");
    }

    const proteinInput: HTMLInputElement | null = document.querySelector(
      'input[name="protein-grams"]',
    );
    if (proteinInput) {
      await user.type(proteinInput, "20");
    }

    // Submit the form
    const saveButton = screen.getByText(/Save/i);
    await user.click(saveButton);

    // Wait for navigation or success indication
    await waitFor(
      () => {
        // The form should either navigate away or show success
        // Check if we're still seeing the form or if we've navigated
        const stillOnForm = screen.queryByText(/Save/i);
        expect(stillOnForm).toBeNull();
      },
      { timeout: 5000 },
    );
  });
});
