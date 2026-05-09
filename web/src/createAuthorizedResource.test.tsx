import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { Component, Show } from "solid-js";
import createAuthorizedResource from "./createAuthorizedResource";
import { AuthorizationError } from "./Api";

// Mock Auth0
const mockLogout = vi.fn();
vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      isAuthenticated: () => true,
      user: () => ({ name: "Test User" }),
      accessToken: () => "test-access-token",
      auth0: () => ({ logout: mockLogout }),
    },
  ],
}));

describe("createAuthorizedResource", () => {
  it("should work with single parameter (fetcher only)", async () => {
    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource(async (token: string) => {
        expect(token).toBe("test-access-token");
        return { message: "success" };
      });

      return (
        <Show when={data()}>
          <div>{data()?.message}</div>
        </Show>
      );
    };

    render(() => <TestComponent />);

    await waitFor(() => {
      expect(screen.getByText("success")).toBeTruthy();
    });
  });

  it("should work with two parameters (fetcher and options)", async () => {
    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource(
        async (token: string) => {
          expect(token).toBe("test-access-token");
          return { value: 42 };
        },
        { initialValue: { value: 0 } },
      );

      return <div>{data()?.value ?? 0}</div>;
    };

    render(() => <TestComponent />);

    // Initially shows initial value
    expect(screen.getByText("0")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("42")).toBeTruthy();
    });
  });

  it("should work with three parameters (source, fetcher, and options)", async () => {
    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource(
        () => "test-source",
        async (token: string, source: string) => {
          expect(token).toBe("test-access-token");
          expect(source).toBe("test-source");
          return { result: "from-source" };
        },
        { initialValue: { result: "initial" } },
      );

      return <div>{data()?.result ?? "initial"}</div>;
    };

    render(() => <TestComponent />);

    expect(screen.getByText("initial")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("from-source")).toBeTruthy();
    });
  });

  it("should logout and re-throw when AuthorizationError occurs", async () => {
    mockLogout.mockClear();

    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource<{ message: string }>(
        async (token: string) => {
          throw new AuthorizationError("Unauthorized");
        },
      );

      return (
        <Show
          when={!((data as any)["error"] as unknown)}
          fallback={<div>Error occurred</div>}
        >
          <div>Success</div>
        </Show>
      );
    };

    render(() => <TestComponent />);

    await waitFor(() => {
      expect(screen.getByText("Error occurred")).toBeTruthy();
    });

    expect(mockLogout).toHaveBeenCalledWith({
      returnTo: window.location.origin,
    });
  });

  it("should re-throw non-AuthorizationError errors without logging out", async () => {
    mockLogout.mockClear();

    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource<{ message: string }>(
        async (token: string) => {
          throw new Error("Some other error");
        },
      );

      return (
        <Show
          when={!((data as any)["error"] as unknown)}
          fallback={<div>Other error occurred</div>}
        >
          <div>Success</div>
        </Show>
      );
    };

    render(() => <TestComponent />);

    await waitFor(() => {
      expect(screen.getByText("Other error occurred")).toBeTruthy();
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });
});
