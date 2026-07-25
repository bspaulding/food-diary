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
