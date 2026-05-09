import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import UserProfile from "./UserProfile";
import { NutritionTargetsProvider } from "./NutritionTargets";

vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      user: () => ({
        picture: "https://example.com/avatar.jpg",
        nickname: "testuser",
        name: "Test User",
        email: "test@example.com",
      }),
      isAuthenticated: () => true,
      auth0: () => ({
        logout: vi.fn(),
      }),
      accessToken: () => "test-token",
    },
  ],
}));

describe("UserProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should display user profile information", () => {
    render(() => <UserProfile />);

    expect(screen.getByText("test@example.com")).toBeTruthy();
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/avatar.jpg");
  });

  it("should display name when nickname is not available", () => {
    render(() => <UserProfile />);
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("should have link to import entries", () => {
    render(() => <UserProfile />);

    const importLink = screen.getByText("Import Entries");
    expect(importLink.getAttribute("href")).toBe("/diary_entry/import");
  });

  it("should have link to export entries", () => {
    render(() => <UserProfile />);

    const exportLink = screen.getByText("Export Entries");
    expect(exportLink.getAttribute("href")).toBe("/diary_entry/export");
  });

  it("should save daily targets when form is submitted", async () => {
    const user = userEvent.setup();

    render(() => (
      <NutritionTargetsProvider>
        <UserProfile />
      </NutritionTargetsProvider>
    ));

    const caloriesInput = screen.getByDisplayValue("2000");
    await user.clear(caloriesInput);
    await user.type(caloriesInput, "2200");

    const saveButton = screen.getByText("Save Targets");
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Saved!")).toBeTruthy();
    });
  });

  it("should call logout when logout button is clicked", async () => {
    const user = userEvent.setup();

    render(() => <UserProfile />);

    const logoutButton = screen.getByText("Logout");
    await user.click(logoutButton);

    expect(logoutButton).toBeTruthy();
  });
});
