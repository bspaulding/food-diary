import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import ImportDiaryEntries from "./ImportDiaryEntries";

interface GraphQLRequest {
  query: string;
}

function isGraphQLRequest(obj: unknown): obj is GraphQLRequest {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return "query" in record && typeof record.query === "string";
}

vi.mock("./Auth0", () => ({
  useAuth: () => [
    {
      isAuthenticated: () => true,
      accessToken: () => "test-token",
      user: () => ({ name: "Test User" }),
      auth0: () => null,
    },
  ],
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  A: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as Element}</a>
  ),
}));

describe("ImportDiaryEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render file upload form initially", () => {
    render(() => <ImportDiaryEntries />);

    expect(
      screen.getByText("Select a CSV to import entries from."),
    ).toBeTruthy();
    expect(screen.getByText("Expected columns are:")).toBeTruthy();
    expect(screen.getByText("Consumed At")).toBeTruthy();
    expect(screen.getByText("Description")).toBeTruthy();
  });

  it("should parse valid CSV file and display preview", async () => {
    const user = userEvent.setup();

    const csvContent = `Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
2024-01-01T10:00:00Z,Apple,1,95,0.3,0.1,0,0.1,0.1,0,2,25,4,19,0,0.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText(/1 rows parsed/)).toBeTruthy();
      expect(screen.getByText("Apple")).toBeTruthy();
      expect(screen.getByText("Import Entries")).toBeTruthy();
    });
  });

  it("should show error count when CSV has invalid rows", async () => {
    const user = userEvent.setup();

    const csvContent = `Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
invalid-date,Apple,1,95,0.3,0.1,0,0.1,0.1,0,2,25,4,19,0,0.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText(/1 errors/)).toBeTruthy();
    });
  });

  it("should import entries successfully", async () => {
    const user = userEvent.setup();

    const csvContent = `Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
2024-01-01T10:00:00Z,Apple,1,95,0.3,0.1,0,0.1,0.1,0,2,25,4,19,0,0.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (
          isGraphQLRequest(body) &&
          body.query.includes("InsertDiaryEntries")
        ) {
          return HttpResponse.json({
            data: {
              insert_food_diary_diary_entry: {
                affected_rows: 1,
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Import Entries")).toBeTruthy();
    });

    const importButton = screen.getByText("Import Entries");
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText("Import successful!")).toBeTruthy();
      expect(screen.getByText("Back to diary")).toBeTruthy();
    });
  });

  it("should show Importing... while saving", async () => {
    const user = userEvent.setup();

    const csvContent = `Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
2024-01-01T10:00:00Z,Apple,1,95,0.3,0.1,0,0.1,0.1,0,2,25,4,19,0,0.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });

    server.use(
      http.post("/api/v1/graphql", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          data: {
            insert_food_diary_diary_entry: {
              affected_rows: 1,
            },
          },
        });
      }),
    );

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Import Entries")).toBeTruthy();
    });

    const importButton = screen.getByText("Import Entries");
    await user.click(importButton);

    expect(screen.getByText("Importing...")).toBeTruthy();
  });

  it("should handle import errors", async () => {
    const user = userEvent.setup();

    const csvContent = `Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
2024-01-01T10:00:00Z,Apple,1,95,0.3,0.1,0,0.1,0.1,0,2,25,4,19,0,0.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (
          isGraphQLRequest(body) &&
          body.query.includes("InsertDiaryEntries")
        ) {
          return HttpResponse.error();
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Import Entries")).toBeTruthy();
    });

    const importButton = screen.getByText("Import Entries");
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText("Import Error")).toBeTruthy();
    });
  });

  it("should handle file read errors", async () => {
    const user = userEvent.setup();

    // Create a file that will fail to read
    const file = new File(["invalid"], "test.csv", { type: "text/csv" });

    // Mock FileReader to simulate an error
    const originalFileReader = global.FileReader;
    global.FileReader = class {
      addEventListener(event: string, handler: EventListener) {
        if (event === "error") {
          setTimeout(() => handler(new Error("File read error") as any), 0);
        }
      }
      readAsText() {}
    } as any;

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Import Error")).toBeTruthy();
    });

    // Restore
    global.FileReader = originalFileReader;
  });

  it("should handle file read with no event target", async () => {
    const user = userEvent.setup();

    const file = new File(["test"], "test.csv", { type: "text/csv" });

    // Mock FileReader to simulate missing event.target
    const originalFileReader = global.FileReader;
    global.FileReader = class {
      addEventListener(event: string, handler: EventListener) {
        if (event === "load") {
          setTimeout(() => handler({} as Event), 0); // Event with no target
        }
      }
      readAsText() {}
    } as any;

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Import Error")).toBeTruthy();
    });

    // Restore
    global.FileReader = originalFileReader;
  });

  it("should toggle nutrition facts details", async () => {
    const user = userEvent.setup();

    const csvContent = `Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
2024-01-01T10:00:00Z,Apple,1,95,0.3,0.1,0,0.1,0.1,0,2,25,4,19,0,0.5`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("View Details")).toBeTruthy();
    });

    const viewButton = screen.getByText("View Details");
    await user.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText("Hide Details")).toBeTruthy();
      expect(screen.getByText("Saturated Fat (g)")).toBeTruthy();
    });

    const hideButton = screen.getByText("Hide Details");
    await user.click(hideButton);

    await waitFor(() => {
      expect(screen.getByText("View Details")).toBeTruthy();
    });
  });

  it("should display formatted date in preview", async () => {
    const user = userEvent.setup();

    const csvContent = `Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
2024-03-15T14:30:00Z,Banana,2,210,0.8,0.2,0,0.2,0.2,0,2,54,6,28,0,2.6`;

    const file = new File([csvContent], "test.csv", { type: "text/csv" });

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText("Banana")).toBeTruthy();
      // Check that a formatted date appears
      expect(screen.getByText(/March 15, 2024/)).toBeTruthy();
    });
  });

  it("should handle no file selected", async () => {
    const user = userEvent.setup();

    render(() => <ImportDiaryEntries />);

    const fileInput = document.querySelector(
      'input[name="diary-import-file"]',
    ) as HTMLInputElement;

    // Simulate input event with no files
    Object.defineProperty(fileInput, "files", {
      value: [],
      writable: false,
    });

    const event = new Event("input", { bubbles: true });
    fileInput.dispatchEvent(event);

    // Should still show the upload form
    expect(
      screen.getByText("Select a CSV to import entries from."),
    ).toBeTruthy();
  });
});
