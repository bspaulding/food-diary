import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import DateBadge from "./DateBadge";

describe("DateBadge", () => {
  it("renders date with day and month", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    render(() => <DateBadge date={date} />);

    // Check that day number is rendered
    expect(screen.getByText("15")).toBeTruthy();

    // Check that month abbreviation is rendered (Jan in title case, uppercase class applied via CSS)
    expect(screen.getByText("Jan")).toBeTruthy();
  });

  it("renders with custom class", () => {
    const date = new Date("2024-03-20T12:00:00Z");
    const { container } = render(() => (
      <DateBadge date={date} class="custom-class" />
    ));

    const div = container.querySelector(".custom-class");
    expect(div).toBeTruthy();
  });

  it("renders without custom class", () => {
    const date = new Date("2024-06-10T12:00:00Z");
    render(() => <DateBadge date={date} />);

    // Check that day number is rendered
    expect(screen.getByText("10")).toBeTruthy();

    // Check that month abbreviation is rendered
    expect(screen.getByText("Jun")).toBeTruthy();
  });

  it("formats different dates correctly", () => {
    const date1 = new Date("2024-12-25T12:00:00Z");
    const { unmount } = render(() => <DateBadge date={date1} />);

    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getByText("Dec")).toBeTruthy();

    unmount();

    const date2 = new Date("2024-07-04T12:00:00Z");
    render(() => <DateBadge date={date2} />);

    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Jul")).toBeTruthy();
  });

  it("applies correct CSS classes", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const { container } = render(() => <DateBadge date={date} />);

    // Check that the root div has the correct classes
    const rootDiv = container.querySelector(
      ".text-center.text-xl.font-semibold",
    );
    expect(rootDiv).toBeTruthy();

    // Check that day has correct class
    const dayElement = container.querySelector(".text-4xl");
    expect(dayElement).toBeTruthy();

    // Check that month has uppercase class
    const monthElement = container.querySelector(".uppercase");
    expect(monthElement).toBeTruthy();
  });
});
