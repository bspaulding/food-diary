import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import PullToRefresh, { PULL_THRESHOLD } from "./PullToRefresh";

function pull(
  element: Element,
  distance: number,
  { release = true }: { release?: boolean } = {},
) {
  // Finger movement is damped by the component, so move twice as far as the
  // indicator distance we want.
  fireEvent.touchStart(element, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(element, { touches: [{ clientY: distance * 2 }] });
  if (release) {
    fireEvent.touchEnd(element);
  }
}

describe("PullToRefresh", () => {
  beforeEach(() => {
    document.documentElement.scrollTop = 0;
  });

  it("renders its children", () => {
    render(() => (
      <PullToRefresh onRefresh={() => Promise.resolve()}>
        <p>Diary content</p>
      </PullToRefresh>
    ));

    expect(screen.getByText("Diary content")).toBeTruthy();
  });

  it("calls onRefresh when pulled past the threshold", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(() => (
      <PullToRefresh onRefresh={onRefresh}>
        <p>Diary content</p>
      </PullToRefresh>
    ));

    pull(screen.getByTestId("pull-to-refresh"), PULL_THRESHOLD + 10);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("does not call onRefresh when released before the threshold", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(() => (
      <PullToRefresh onRefresh={onRefresh}>
        <p>Diary content</p>
      </PullToRefresh>
    ));

    pull(screen.getByTestId("pull-to-refresh"), PULL_THRESHOLD - 10);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not call onRefresh when the page is scrolled down", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(() => (
      <PullToRefresh onRefresh={onRefresh}>
        <p>Diary content</p>
      </PullToRefresh>
    ));

    // jsdom has no layout, so shadow the scrollingElement getter to simulate
    // a scrolled page, then remove the shadow to restore the real getter.
    Object.defineProperty(document, "scrollingElement", {
      value: { scrollTop: 200 } as Element,
      configurable: true,
    });
    try {
      pull(screen.getByTestId("pull-to-refresh"), PULL_THRESHOLD + 10);
    } finally {
      delete (document as { scrollingElement?: Element }).scrollingElement;
    }

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("shows a spinner while refreshing and hides it when done", async () => {
    let resolveRefresh: () => void = () => {};
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    render(() => (
      <PullToRefresh onRefresh={onRefresh}>
        <p>Diary content</p>
      </PullToRefresh>
    ));

    pull(screen.getByTestId("pull-to-refresh"), PULL_THRESHOLD + 10);

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

    resolveRefresh();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("ignores pulls that start while a refresh is in flight", async () => {
    const onRefresh = vi.fn(() => new Promise<void>(() => {}));
    render(() => (
      <PullToRefresh onRefresh={onRefresh}>
        <p>Diary content</p>
      </PullToRefresh>
    ));
    const container = screen.getByTestId("pull-to-refresh");

    pull(container, PULL_THRESHOLD + 10);
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    pull(container, PULL_THRESHOLD + 10);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("resets the pull when the finger moves back above the start", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(() => (
      <PullToRefresh onRefresh={onRefresh}>
        <p>Diary content</p>
      </PullToRefresh>
    ));
    const container = screen.getByTestId("pull-to-refresh");

    fireEvent.touchStart(container, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(container, {
      touches: [{ clientY: 100 + PULL_THRESHOLD * 2 }],
    });
    fireEvent.touchMove(container, { touches: [{ clientY: 50 }] });
    fireEvent.touchEnd(container);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
