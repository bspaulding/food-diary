import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@solidjs/testing-library";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import createAuthorizedResource from "./createAuthorizedResource";
import { fetchEntries } from "./Api";
import { useAuth } from "./Auth0";
import { Component, createSignal } from "solid-js";

// Mock the Auth0 module
vi.mock("./Auth0", () => {
  const mockAuth0Client = {
    logout: vi.fn().mockResolvedValue(undefined),
  };

  return {
    useAuth: vi.fn(() => {
      const [accessToken] = createSignal("test-token");
      const [auth0] = createSignal(mockAuth0Client);
      return [{ accessToken, auth0 }];
    }),
  };
});

describe("Authorization Error Integration", () => {
  it("should call logout when createAuthorizedResource encounters a 401 error", async () => {
    // Mock GraphQL endpoint to return 401
    server.use(
      http.post("/api/v1/graphql", () => {
        return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        });
      }),
    );

    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource((token: string) =>
        fetchEntries(token),
      );

      return <div>{data.loading ? "Loading" : "Loaded"}</div>;
    };

    const { unmount } = render(() => <TestComponent />);

    // Wait for the resource to attempt the fetch and handle the error
    await waitFor(
      () => {
        const [{ auth0 }] = useAuth();
        expect(auth0()?.logout).toHaveBeenCalledWith({
          returnTo: window.location.origin,
        });
      },
      { timeout: 2000 },
    );

    unmount();
  });

  it("should call logout when createAuthorizedResource encounters a 403 error", async () => {
    // Mock GraphQL endpoint to return 403
    server.use(
      http.post("/api/v1/graphql", () => {
        return new HttpResponse(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }),
    );

    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource((token: string) =>
        fetchEntries(token),
      );

      return <div>{data.loading ? "Loading" : "Loaded"}</div>;
    };

    const { unmount } = render(() => <TestComponent />);

    // Wait for the resource to attempt the fetch and handle the error
    await waitFor(
      () => {
        const [{ auth0 }] = useAuth();
        expect(auth0()?.logout).toHaveBeenCalledWith({
          returnTo: window.location.origin,
        });
      },
      { timeout: 2000 },
    );

    unmount();
  });
});
