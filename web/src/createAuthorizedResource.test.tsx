import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { Component, Show, createSignal } from "solid-js";
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

  // These pin down the parts of createResource's contract that call sites
  // actually depend on (SearchItemsForm reads .loading, DiaryList reads
  // mutate/refetch) but weren't covered above, so a future rewrite onto
  // Solid 2.0's memo-based resources has something to check itself against.
  it("exposes .loading while the fetcher is pending, then false once resolved", async () => {
    let resolveFetch: (value: { message: string }) => void = () => {};
    const fetchPromise = new Promise<{ message: string }>((resolve) => {
      resolveFetch = resolve;
    });

    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource(async () => fetchPromise);
      return (
        <div>
          <span data-testid="loading">{String(data.loading)}</span>
          <span data-testid="value">{data()?.message ?? "none"}</span>
        </div>
      );
    };

    render(() => <TestComponent />);

    expect(screen.getByTestId("loading").textContent).toBe("true");

    resolveFetch({ message: "done" });

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("value").textContent).toBe("done");
  });

  it("mutate() updates the value directly without invoking the fetcher again", async () => {
    const fetcher = vi.fn(async () => ({ count: 1 }));
    let mutate: (value: { count: number }) => void = () => {};

    const TestComponent: Component = () => {
      const [data, resourceActions] = createAuthorizedResource(fetcher);
      mutate = resourceActions.mutate;
      return <div>{data()?.count ?? "loading"}</div>;
    };

    render(() => <TestComponent />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeTruthy();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    mutate({ count: 99 });

    await waitFor(() => {
      expect(screen.getByText("99")).toBeTruthy();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetch() re-invokes the fetcher and updates the value", async () => {
    let callCount = 0;
    const fetcher = vi.fn(async () => {
      callCount += 1;
      return { count: callCount };
    });
    let refetch: () => void = () => {};

    const TestComponent: Component = () => {
      const [data, resourceActions] = createAuthorizedResource(fetcher);
      refetch = () => resourceActions.refetch();
      return <div>{data()?.count ?? "loading"}</div>;
    };

    render(() => <TestComponent />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeTruthy();
    });

    refetch();

    await waitFor(() => {
      expect(screen.getByText("2")).toBeTruthy();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("re-fetches with the new value when the source signal changes", async () => {
    const [source, setSource] = createSignal("first");
    const fetcher = vi.fn(async (token: string, src: string) => ({ src }));

    const TestComponent: Component = () => {
      const [data] = createAuthorizedResource(source, fetcher);
      return <div>{data()?.src ?? "loading"}</div>;
    };

    render(() => <TestComponent />);

    await waitFor(() => {
      expect(screen.getByText("first")).toBeTruthy();
    });

    setSource("second");

    await waitFor(() => {
      expect(screen.getByText("second")).toBeTruthy();
    });
    expect(fetcher).toHaveBeenCalledWith("test-access-token", "second");
  });
});
