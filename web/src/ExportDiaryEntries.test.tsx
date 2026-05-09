import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import ExportDiaryEntries from "./ExportDiaryEntries";

vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      accessToken: () => "test-token",
    },
  ],
}));

const exportResponse = {
  data: {
    food_diary_diary_entry: [
      {
        consumed_at: "2024-01-01T10:00:00Z",
        servings: 1,
        nutrition_item: {
          description: "Apple",
          calories: 95,
          total_fat_grams: 0.3,
          saturated_fat_grams: 0.1,
          trans_fat_grams: 0,
          polyunsaturated_fat_grams: 0.1,
          monounsaturated_fat_grams: 0.1,
          cholesterol_mg: 0,
          sodium_mg: 2,
          total_carbohydrate_grams: 25,
          dietary_fiber_grams: 4,
          total_sugars_grams: 19,
          added_sugars_grams: 0,
          protein_grams: 0.5,
        },
      },
    ],
  },
};

function mockDownload() {
  const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
  const mockRevokeObjectURL = vi.fn();
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;

  const mockAnchor = document.createElement("a");
  const mockClick = vi.fn();
  mockAnchor.click = mockClick;
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = vi.fn((tag: string) => {
    if (tag === "a") return mockAnchor;
    return originalCreateElement(tag);
  }) as any;

  return {
    mockCreateObjectURL,
    mockRevokeObjectURL,
    mockClick,
    restore: () => {
      document.createElement = originalCreateElement;
    },
  };
}

describe("ExportDiaryEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show date range inputs defaulting to last 2 weeks", () => {
    render(() => <ExportDiaryEntries />);

    const fromInput = screen.getByLabelText("From") as HTMLInputElement;
    const toInput = screen.getByLabelText("To") as HTMLInputElement;

    expect(fromInput).toBeTruthy();
    expect(toInput).toBeTruthy();

    // Both inputs should be enabled by default
    expect(fromInput.disabled).toBe(false);
    expect(toInput.disabled).toBe(false);

    // End date should be today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    expect(toInput.value).toBe(`${yyyy}-${mm}-${dd}`);

    // Start date should be 13 days ago (14-day range inclusive)
    const start = new Date();
    start.setDate(start.getDate() - 13);
    const sy = start.getFullYear();
    const sm = String(start.getMonth() + 1).padStart(2, "0");
    const sd = String(start.getDate()).padStart(2, "0");
    expect(fromInput.value).toBe(`${sy}-${sm}-${sd}`);
  });

  it("should disable date inputs when 'All dates' is checked", async () => {
    const user = userEvent.setup();
    render(() => <ExportDiaryEntries />);

    const allDatesCheckbox = screen.getByLabelText("All dates");
    const fromInput = screen.getByLabelText("From") as HTMLInputElement;
    const toInput = screen.getByLabelText("To") as HTMLInputElement;

    expect(fromInput.disabled).toBe(false);
    expect(toInput.disabled).toBe(false);

    await user.click(allDatesCheckbox);

    expect(fromInput.disabled).toBe(true);
    expect(toInput.disabled).toBe(true);
  });

  it("should export with date range variables when date inputs are set", async () => {
    const user = userEvent.setup();
    let capturedRequestBody!: {
      variables: { startDate: string; endDate: string };
    };

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        capturedRequestBody =
          (await request.json()) as typeof capturedRequestBody;
        return HttpResponse.json(exportResponse);
      }),
    );

    const { mockCreateObjectURL, mockClick, mockRevokeObjectURL, restore } =
      mockDownload();

    render(() => <ExportDiaryEntries />);

    const exportButton = screen.getByText("Export As CSV");
    await user.click(exportButton);

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    // Should have sent date range variables as ISO 8601
    expect(capturedRequestBody.variables).toBeDefined();
    expect(capturedRequestBody.variables.startDate).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(capturedRequestBody.variables.endDate).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );

    restore();
  });

  it("should export all entries with no date variables when 'All dates' is checked", async () => {
    const user = userEvent.setup();
    let capturedRequestBody!: { variables: Record<string, never> };

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        capturedRequestBody =
          (await request.json()) as typeof capturedRequestBody;
        return HttpResponse.json(exportResponse);
      }),
    );

    const { mockCreateObjectURL, mockClick, mockRevokeObjectURL, restore } =
      mockDownload();

    render(() => <ExportDiaryEntries />);

    await user.click(screen.getByLabelText("All dates"));

    const exportButton = screen.getByText("Export As CSV");
    await user.click(exportButton);

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    // Should have sent no date range variables
    expect(capturedRequestBody.variables).toEqual({});

    restore();
  });

  it("should have a link back to the profile page", () => {
    render(() => <ExportDiaryEntries />);

    const backLink = screen.getByText("Back to profile");
    expect(backLink.getAttribute("href")).toBe("/profile");
  });
});
