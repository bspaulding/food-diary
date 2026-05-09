import { describe, it, expect, vi } from "vitest";

// Mock all the components and dependencies
vi.mock("solid-js/web", () => ({
  render: vi.fn(),
}));

vi.mock("@solidjs/router", () => ({
  Router: vi.fn(({ children }: { children: unknown }) => children),
  Route: vi.fn(() => null),
}));

vi.mock("./App", () => ({ default: vi.fn() }));
vi.mock("./DiaryList", () => ({ default: vi.fn() }));
vi.mock("./NewNutritionItemForm", () => ({ default: vi.fn() }));
vi.mock("./NutritionItemShow", () => ({ default: vi.fn() }));
vi.mock("./NutritionItemEdit", () => ({ default: vi.fn() }));
vi.mock("./NewDiaryEntryForm", () => ({ default: vi.fn() }));
vi.mock("./NewRecipeForm", () => ({ default: vi.fn() }));
vi.mock("./RecipeShow", () => ({ default: vi.fn() }));
vi.mock("./RecipeEdit", () => ({ default: vi.fn() }));
vi.mock("./ImportDiaryEntries", () => ({ default: vi.fn() }));
vi.mock("./ExportDiaryEntries", () => ({ default: vi.fn() }));
vi.mock("./UserProfile", () => ({ default: vi.fn() }));
vi.mock("./DiaryEntryEditForm", () => ({ default: vi.fn() }));
vi.mock("./Trends", () => ({ default: vi.fn() }));
vi.mock("./NutritionTargets", () => ({
  NutritionTargetsProvider: ({ children }: { children: unknown }) => children,
}));

describe("index", () => {
  it("should call render with router and routes", async () => {
    const { render } = await import("solid-js/web");

    // Mock document.getElementById
    const mockRoot = document.createElement("div");
    mockRoot.id = "root";
    document.body.appendChild(mockRoot);

    await import("./index");

    expect(render).toHaveBeenCalled();

    // Verify render was called with correct parameters
    const renderAny: Record<string, unknown> = render as any;
    const mockData: unknown = renderAny.mock;
    const mockObj = mockData as { calls: unknown[][] };
    const renderCall: unknown[] = mockObj.calls[0];
    expect(renderCall).toBeDefined();
    expect(renderCall[1]).toBe(mockRoot); // Second argument should be the root element

    // Clean up
    document.body.removeChild(mockRoot);
  });
});
