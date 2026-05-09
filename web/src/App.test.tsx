import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockRegisterLogoutHandler = vi.hoisted(() =>
  vi.fn<(handler: (() => void) | undefined) => void>(),
);
vi.mock("./Auth0", () => ({
  useAuth: mockUseAuth,
}));
vi.mock("./Api", () => ({
  registerLogoutHandler: mockRegisterLogoutHandler,
}));

// Must import after vi.mock so the mock is in place
import App from "./App";

describe("App", () => {
  describe("when user is not authenticated", () => {
    const mockLoginWithRedirect = vi.fn();

    beforeEach(() => {
      mockLoginWithRedirect.mockClear();
      mockUseAuth.mockReturnValue([
        {
          isAuthenticated: () => false,
          user: () => null,
          accessToken: () => null,
          auth0: () => ({ loginWithRedirect: mockLoginWithRedirect }),
        },
      ]);
    });

    it("should display Log In button", () => {
      render(() => <App>Content</App>);

      const loginButton = screen.getByText("Log In");
      expect(loginButton).toBeTruthy();
    });

    it("should call loginWithRedirect when Log In button is clicked", async () => {
      const user = userEvent.setup();

      render(() => <App>Content</App>);

      const loginButton = screen.getByText("Log In");
      await user.click(loginButton);

      expect(mockLoginWithRedirect).toHaveBeenCalled();
    });
  });

  describe("when user is authenticated", () => {
    const mockLogout = vi.fn();

    beforeEach(() => {
      mockLogout.mockClear();
      mockRegisterLogoutHandler.mockClear();
      mockUseAuth.mockReturnValue([
        {
          isAuthenticated: () => true,
          user: () => ({
            picture: "https://example.com/avatar.jpg",
            name: "Test User",
          }),
          accessToken: () => "test-token",
          auth0: () => ({ logout: mockLogout }),
        },
      ]);
    });

    it("should display children", () => {
      render(() => <App>Test Content</App>);

      expect(screen.getByText("Test Content")).toBeTruthy();
    });

    it("should register a logout handler that calls auth0 logout", () => {
      render(() => <App>Content</App>);

      expect(mockRegisterLogoutHandler).toHaveBeenCalledWith(
        expect.any(Function),
      );
      const handler = mockRegisterLogoutHandler.mock.calls[0][0];
      handler?.();
      expect(mockLogout).toHaveBeenCalledWith({
        returnTo: window.location.origin,
      });
    });

    it("should display user profile picture", () => {
      render(() => <App>Content</App>);

      const img = screen.getByRole("img") as HTMLImageElement;
      expect(img.src).toBe("https://example.com/avatar.jpg");
    });
  });
});
