import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@solidjs/testing-library";
import SegmentedControl from "./SegmentedControl";

describe("SegmentedControl", () => {
  it("renders all segment buttons", () => {
    render(() => (
      <SegmentedControl segments={["First", "Second", "Third"]}>
        {(segment: string) => (
          <div data-testid="content">{segment} content</div>
        )}
      </SegmentedControl>
    ));

    const buttons = screen.getAllByText(/First|Second|Third/);
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("displays the first segment content by default", () => {
    render(() => (
      <SegmentedControl segments={["First", "Second"]}>
        {(segment: string) => (
          <div data-testid="content">{segment} Content</div>
        )}
      </SegmentedControl>
    ));

    expect(screen.getByText("First Content")).toBeTruthy();
  });

  it("switches to the clicked segment", async () => {
    render(() => (
      <SegmentedControl segments={["First", "Second", "Third"]}>
        {(segment: string) => (
          <div data-testid="content">{segment} Content</div>
        )}
      </SegmentedControl>
    ));

    // Initially shows first segment
    expect(screen.getByText("First Content")).toBeTruthy();

    // Click on second segment button (get the button in the list, not the content)
    const buttons: HTMLElement[] = screen.getAllByText("Second");
    const secondButton: HTMLElement | undefined = buttons.find(
      (el: HTMLElement) => el.tagName === "LI",
    );
    expect(secondButton).toBeTruthy();
    if (!secondButton) throw new Error("Second button not found");
    await fireEvent.click(secondButton);
    expect(screen.getByText("Second Content")).toBeTruthy();

    // Click on third segment
    const thirdButtons: HTMLElement[] = screen.getAllByText("Third");
    const thirdButton: HTMLElement | undefined = thirdButtons.find(
      (el: HTMLElement) => el.tagName === "LI",
    );
    expect(thirdButton).toBeTruthy();
    if (!thirdButton) throw new Error("Third button not found");
    await fireEvent.click(thirdButton);
    expect(screen.getByText("Third Content")).toBeTruthy();

    // Click back to first segment
    const firstButtons: HTMLElement[] = screen.getAllByText("First");
    const firstButton: HTMLElement | undefined = firstButtons.find(
      (el: HTMLElement) => el.tagName === "LI",
    );
    expect(firstButton).toBeTruthy();
    if (!firstButton) throw new Error("First button not found");
    await fireEvent.click(firstButton);
    expect(screen.getByText("First Content")).toBeTruthy();
  });

  it("toggles between two segments correctly - bug fix test", async () => {
    render(() => (
      <SegmentedControl segments={["Suggestions", "Search"]}>
        {(segment: string) => <div data-testid="content">{segment} View</div>}
      </SegmentedControl>
    ));

    // Initially shows Suggestions
    expect(screen.getByText("Suggestions View")).toBeTruthy();

    // Click on Search
    const searchButtons: HTMLElement[] = screen.getAllByText("Search");
    const searchButton: HTMLElement | undefined = searchButtons.find(
      (el: HTMLElement) => el.tagName === "LI",
    );
    expect(searchButton).toBeTruthy();
    if (!searchButton) throw new Error("Search button not found");
    await fireEvent.click(searchButton);
    expect(screen.getByText("Search View")).toBeTruthy();

    // Click back to Suggestions - this is the bug we're fixing
    // Before the fix, this would fail because clicking Suggestions wouldn't switch the view
    const suggestionsButtons: HTMLElement[] =
      screen.getAllByText("Suggestions");
    const suggestionsButton: HTMLElement | undefined = suggestionsButtons.find(
      (el: HTMLElement) => el.tagName === "LI",
    );
    expect(suggestionsButton).toBeTruthy();
    if (!suggestionsButton) throw new Error("Suggestions button not found");
    await fireEvent.click(suggestionsButton);
    expect(screen.getByText("Suggestions View")).toBeTruthy();
  });

  it("applies active styling to the current segment", async () => {
    render(() => (
      <SegmentedControl segments={["First", "Second"]}>
        {(segment: string) => (
          <div data-testid="content">{segment} content</div>
        )}
      </SegmentedControl>
    ));

    const buttons: HTMLElement[] = screen.getAllByText("First");
    const firstButton: HTMLElement | undefined = buttons.find(
      (el: HTMLElement) => el.tagName === "LI",
    );
    const secondButtons: HTMLElement[] = screen.getAllByText("Second");
    const secondButton: HTMLElement | undefined = secondButtons.find(
      (el: HTMLElement) => el.tagName === "LI",
    );

    expect(firstButton).toBeTruthy();
    expect(secondButton).toBeTruthy();
    if (!firstButton) throw new Error("First button not found");
    if (!secondButton) throw new Error("Second button not found");

    // First button should have active styles
    expect(firstButton.className).toContain("bg-slate-500");
    expect(firstButton.className).toContain("text-slate-50");
    expect(secondButton.className).toContain("bg-slate-200");

    // Click second button
    await fireEvent.click(secondButton);

    // Second button should now have active styles
    expect(secondButton.className).toContain("bg-slate-500");
    expect(secondButton.className).toContain("text-slate-50");
  });
});
