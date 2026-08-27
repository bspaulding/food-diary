import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuth } from "./Auth0";
import createAuth0Client from "@auth0/auth0-spa-js";

vi.mock("@auth0/auth0-spa-js");
vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
}));

describe("Auth0", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockLocation: Location = {
      protocol: "http:",
      host: "localhost:3000",
      search: "",
      href: "http://localhost:3000",
    } as Location;
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });
  });

  it("should configure auth0 client and redirect to login when not authenticated", async () => {
    const mockClient = {
      isAuthenticated: vi.fn().mockResolvedValue(false),
      handleRedirectCallback: vi.fn(),
      loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createAuth0Client).mockResolvedValue(mockClient as any);

    const [authState] = useAuth();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(createAuth0Client).toHaveBeenCalledWith({
      domain: import.meta.env.VITE_AUTH0_DOMAIN,
      client_id: import.meta.env.VITE_AUTH0_CLIENT_ID,
      audience: "https://direct-satyr-14.hasura.app/v1/graphql",
      redirect_uri: "http://localhost:3000/auth/callback",
      cacheLocation: "localstorage",
    });
    expect(mockClient.loginWithRedirect).toHaveBeenCalled();
    expect(authState.isAuthenticated()).toBe(false);
  });

  it("should handle redirect callback when code and state params are present", async () => {
    window.location.search = "?code=test-code&state=test-state";
    window.location.href =
      "http://localhost:3000?code=test-code&state=test-state";

    const mockNavigate = vi.fn();
    vi.doMock("@solidjs/router", () => ({
      useNavigate: () => mockNavigate,
    }));

    const mockClient = {
      handleRedirectCallback: vi.fn().mockResolvedValue({}),
      isAuthenticated: vi.fn().mockResolvedValue(false),
      loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createAuth0Client).mockResolvedValue(mockClient as any);

    const { useAuth: useAuthTest } = await import("./Auth0");
    useAuthTest();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockClient.handleRedirectCallback).toHaveBeenCalledWith(
      "http://localhost:3000?code=test-code&state=test-state",
    );
  });

  it("should set user and access token when authenticated", async () => {
    const mockUser = { name: "Test User", email: "test@example.com" };
    const mockToken = "test-access-token";

    const mockClient = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getUser: vi.fn().mockResolvedValue(mockUser),
      getTokenSilently: vi.fn().mockResolvedValue(mockToken),
      handleRedirectCallback: vi.fn(),
    };
    vi.mocked(createAuth0Client).mockResolvedValue(mockClient as any);

    const [authState] = useAuth();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(authState.isAuthenticated()).toBe(true);
    expect(authState.user()).toEqual(mockUser);
    expect(authState.accessToken()).toBe(mockToken);
  });

  it("should fall through to the cache check when handleRedirectCallback fails (e.g. losing a race with another useAuth() instance for the same one-time code)", async () => {
    // useAuth() has no shared context -- every component that calls it gets
    // its own Auth0Client and resource. On a fresh login, multiple
    // instances can race to redeem the same code; the loser's exchange
    // fails, but the winner already populated the shared localStorage
    // cache, so isAuthenticated()/getTokenSilently() should still succeed.
    window.location.search = "?code=test-code&state=test-state";
    window.location.href =
      "http://localhost:3000?code=test-code&state=test-state";

    // A previous test's dynamic import of "./Auth0" is still cached in the
    // module registry; without resetting it, `import("./Auth0")` below
    // would return that stale instance instead of picking up this test's
    // mockNavigate.
    vi.resetModules();
    const mockNavigate = vi.fn();
    vi.doMock("@solidjs/router", () => ({
      useNavigate: () => mockNavigate,
    }));

    const mockClient = {
      handleRedirectCallback: vi
        .fn()
        .mockRejectedValue(new Error("invalid_grant")),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getUser: vi.fn().mockResolvedValue({ name: "Test User" }),
      getTokenSilently: vi.fn().mockResolvedValue("shared-cache-token"),
      loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createAuth0Client).mockResolvedValue(mockClient as any);

    const { useAuth: useAuthTest } = await import("./Auth0");
    const [authState] = useAuthTest();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockClient.handleRedirectCallback).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    expect(mockClient.loginWithRedirect).not.toHaveBeenCalled();
    expect(authState.isAuthenticated()).toBe(true);
    expect(authState.accessToken()).toBe("shared-cache-token");
  });

  it("should redirect to login when the session looks active but the cached token is gone", async () => {
    const mockClient = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getUser: vi.fn().mockResolvedValue({ name: "Test User" }),
      getTokenSilently: vi.fn().mockRejectedValue(new Error("login_required")),
      handleRedirectCallback: vi.fn(),
      loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createAuth0Client).mockResolvedValue(mockClient as any);

    const [authState] = useAuth();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockClient.loginWithRedirect).toHaveBeenCalled();
    expect(authState.isAuthenticated()).toBe(false);
    expect(authState.accessToken()).toBe("");
  });
});
