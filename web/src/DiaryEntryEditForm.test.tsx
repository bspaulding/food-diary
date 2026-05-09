import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type HttpResponseResolver } from "msw";
import { server } from "./test-setup";
import DiaryEntryEditForm from "./DiaryEntryEditForm";

interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

interface CapturedRequest extends GraphQLRequest {
  variables: {
    id: number;
    attrs: {
      servings: number;
      consumed_at: string;
    };
  };
}

function isGraphQLRequest(obj: unknown): obj is GraphQLRequest {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return "query" in record && typeof record.query === "string";
}

function isCapturedRequest(obj: unknown): obj is CapturedRequest {
  if (!isGraphQLRequest(obj)) {
    return false;
  }
  const record = obj as unknown as Record<string, unknown>;
  return "variables" in record && typeof record.variables === "object";
}

// Mock Auth0
vi.mock("./Auth0", () => ({
  useAuth: () => [{ accessToken: () => "test-token" }],
}));

// Mock router hooks
vi.mock(
  "@solidjs/router",
  async (): Promise<{
    useParams: () => { id: string };
    useNavigate: () => ReturnType<typeof vi.fn>;
    [key: string]: unknown;
  }> => {
    const actual: unknown = await vi.importActual("@solidjs/router");
    interface RouterModule {
      [key: string]: unknown;
    }
    if (typeof actual !== "object" || actual === null) {
      return {
        useParams: () => ({ id: "1" }),
        useNavigate: () => vi.fn(),
      };
    }
    const actualModule = actual as RouterModule;
    return {
      ...actualModule,
      useParams: () => ({ id: "1" }),
      useNavigate: () => vi.fn(),
    };
  },
);

const mockDiaryEntry = {
  data: {
    food_diary_diary_entry_by_pk: {
      id: 1,
      consumed_at: "2022-08-28T14:30:00Z",
      servings: 1,
      calories: 160,
      nutrition_item: {
        id: 10,
        description: "Test Item",
        calories: 160,
        total_fat_grams: 2,
        added_sugars_grams: 8,
        protein_grams: 3,
      },
      recipe: null,
    },
  },
};

describe("DiaryEntryEditForm", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("should send updated servings value to the backend when only servings is changed", async () => {
    let capturedRequest: CapturedRequest | null = null;
    const user = userEvent.setup();

    // Mock the GraphQL endpoint
    const handler: HttpResponseResolver = async ({ request }) => {
      const body: unknown = await request.json();
      if (!isGraphQLRequest(body)) {
        return HttpResponse.json({ errors: [{ message: "Invalid request" }] });
      }
      const query: string = body.query;

      // Handle GetDiaryEntry query
      if (query.includes("GetDiaryEntry")) {
        return HttpResponse.json(mockDiaryEntry);
      }

      // Handle UpdateDiaryEntry mutation
      if (query.includes("UpdateDiaryEntry")) {
        if (isCapturedRequest(body)) {
          capturedRequest = body;
        }
        return HttpResponse.json({
          data: {
            update_food_diary_diary_entry_by_pk: {
              id: 1,
            },
          },
        });
      }

      return HttpResponse.json({ errors: [{ message: "Unknown query" }] });
    };

    server.use(http.post("/api/v1/graphql", handler));

    // Render the component
    const { unmount } = render(() => <DiaryEntryEditForm />);

    // Wait for the form to load with data
    await waitFor(
      () => {
        const label = screen.queryByLabelText("Servings");
        expect(label).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Get the servings input and change its value
    const servingsInput = screen.getByLabelText("Servings") as HTMLInputElement;
    expect(servingsInput.value).toBe("1");

    await user.clear(servingsInput);
    await user.type(servingsInput, "2");

    // Click the save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Wait for the update request to be made
    await waitFor(
      () => {
        expect(capturedRequest).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify the mutation contains the correct variables
    expect(capturedRequest).not.toBeNull();
    if (capturedRequest !== null && isCapturedRequest(capturedRequest)) {
      const request: CapturedRequest = capturedRequest;
      expect(request.variables.id).toBe(1);
      expect(request.variables.attrs.servings).toBe(2);
      expect(request.variables.attrs.consumed_at).toBe("2022-08-28T14:30:00Z");
    }

    unmount();
  });

  it("should send both servings and consumed_at when both are changed", async () => {
    let capturedRequest: CapturedRequest | null = null;
    const user = userEvent.setup();

    // Mock the GraphQL endpoint
    const handler: HttpResponseResolver = async ({ request }) => {
      const body: unknown = await request.json();
      if (!isGraphQLRequest(body)) {
        return HttpResponse.json({ errors: [{ message: "Invalid request" }] });
      }
      const query: string = body.query;

      // Handle GetDiaryEntry query
      if (query.includes("GetDiaryEntry")) {
        return HttpResponse.json(mockDiaryEntry);
      }

      // Handle UpdateDiaryEntry mutation
      if (query.includes("UpdateDiaryEntry")) {
        if (isCapturedRequest(body)) {
          capturedRequest = body;
        }
        return HttpResponse.json({
          data: {
            update_food_diary_diary_entry_by_pk: {
              id: 1,
            },
          },
        });
      }

      return HttpResponse.json({ errors: [{ message: "Unknown query" }] });
    };

    server.use(http.post("/api/v1/graphql", handler));

    // Render the component
    const { unmount } = render(() => <DiaryEntryEditForm />);

    // Wait for the form to load with data
    await waitFor(
      () => {
        const label = screen.queryByLabelText("Servings");
        expect(label).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Change servings
    const servingsInput = screen.getByLabelText("Servings") as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "3");

    // Change consumed_at
    const consumedAtInput = screen.getByLabelText(
      "Consumed At",
    ) as HTMLInputElement;
    await user.clear(consumedAtInput);
    await user.type(consumedAtInput, "2022-08-29T15:30");

    // Click the save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Wait for the update request to be made
    await waitFor(
      () => {
        expect(capturedRequest).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify the mutation contains both updated values
    expect(capturedRequest).not.toBeNull();
    if (capturedRequest !== null && isCapturedRequest(capturedRequest)) {
      const request: CapturedRequest = capturedRequest;
      expect(request.variables.id).toBe(1);
      expect(request.variables.attrs.servings).toBe(3);
      expect(request.variables.attrs.consumed_at).toContain("2022-08-29");
    }

    unmount();
  });

  it("should handle updating servings to 0", async () => {
    let capturedRequest: CapturedRequest | null = null;
    const user = userEvent.setup();

    // Mock the GraphQL endpoint
    const handler: HttpResponseResolver = async ({ request }) => {
      const body: unknown = await request.json();
      if (!isGraphQLRequest(body)) {
        return HttpResponse.json({ errors: [{ message: "Invalid request" }] });
      }
      const query: string = body.query;

      // Handle GetDiaryEntry query
      if (query.includes("GetDiaryEntry")) {
        return HttpResponse.json(mockDiaryEntry);
      }

      // Handle UpdateDiaryEntry mutation
      if (query.includes("UpdateDiaryEntry")) {
        if (isCapturedRequest(body)) {
          capturedRequest = body;
        }
        return HttpResponse.json({
          data: {
            update_food_diary_diary_entry_by_pk: {
              id: 1,
            },
          },
        });
      }

      return HttpResponse.json({ errors: [{ message: "Unknown query" }] });
    };

    server.use(http.post("/api/v1/graphql", handler));

    // Render the component
    const { unmount } = render(() => <DiaryEntryEditForm />);

    // Wait for the form to load with data
    await waitFor(
      () => {
        const label = screen.queryByLabelText("Servings");
        expect(label).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Change servings to 0 (edge case with falsy value)
    const servingsInput = screen.getByLabelText("Servings") as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "0");

    // Click the save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Wait for the update request to be made
    await waitFor(
      () => {
        expect(capturedRequest).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify the request includes servings as 0, not the original value
    expect(capturedRequest).not.toBeNull();
    if (capturedRequest !== null && isCapturedRequest(capturedRequest)) {
      const request: CapturedRequest = capturedRequest;
      expect(request.variables.attrs.servings).toBe(0);
    }

    unmount();
  });

  it("should send fractional servings value to the backend", async () => {
    let capturedRequest: CapturedRequest | null = null;
    const user = userEvent.setup();

    // Mock the GraphQL endpoint
    const handler: HttpResponseResolver = async ({ request }) => {
      const body: unknown = await request.json();
      if (!isGraphQLRequest(body)) {
        return HttpResponse.json({ errors: [{ message: "Invalid request" }] });
      }
      const query: string = body.query;

      // Handle GetDiaryEntry query
      if (query.includes("GetDiaryEntry")) {
        return HttpResponse.json(mockDiaryEntry);
      }

      // Handle UpdateDiaryEntry mutation
      if (query.includes("UpdateDiaryEntry")) {
        if (isCapturedRequest(body)) {
          capturedRequest = body;
        }
        return HttpResponse.json({
          data: {
            update_food_diary_diary_entry_by_pk: {
              id: 1,
            },
          },
        });
      }

      return HttpResponse.json({ errors: [{ message: "Unknown query" }] });
    };

    server.use(http.post("/api/v1/graphql", handler));

    // Render the component
    const { unmount } = render(() => <DiaryEntryEditForm />);

    // Wait for the form to load with data
    await waitFor(
      () => {
        const label = screen.queryByLabelText("Servings");
        expect(label).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Get the servings input and change its value to a fractional number
    const servingsInput = screen.getByLabelText("Servings") as HTMLInputElement;
    expect(servingsInput.value).toBe("1");

    await user.clear(servingsInput);
    await user.type(servingsInput, "2.5");

    // Click the save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Wait for the update request to be made
    await waitFor(
      () => {
        expect(capturedRequest).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Verify the mutation contains the fractional value, not rounded down
    expect(capturedRequest).not.toBeNull();
    if (capturedRequest !== null && isCapturedRequest(capturedRequest)) {
      const request: CapturedRequest = capturedRequest;
      expect(request.variables.id).toBe(1);
      expect(request.variables.attrs.servings).toBe(2.5);
      expect(request.variables.attrs.consumed_at).toBe("2022-08-28T14:30:00Z");
    }

    unmount();
  });

  it("should show error messages when update fails", async () => {
    const user = userEvent.setup();

    // Mock the GraphQL endpoint
    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Handle GetDiaryEntry query
        if (query.includes("GetDiaryEntry")) {
          return HttpResponse.json(mockDiaryEntry);
        }

        // Handle UpdateDiaryEntry mutation with error
        if (query.includes("UpdateDiaryEntry")) {
          return HttpResponse.json({
            errors: [
              { message: "Database error" },
              { message: "Validation failed" },
            ],
          });
        }

        return HttpResponse.json({ errors: [{ message: "Unknown query" }] });
      }),
    );

    const { unmount } = render(() => <DiaryEntryEditForm />);

    // Wait for the form to load with data
    await waitFor(() => {
      expect(screen.queryByLabelText("Servings")).not.toBeNull();
    });

    // Change servings
    const servingsInput = screen.getByLabelText("Servings") as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "3");

    // Click the save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Check that errors are displayed
    await waitFor(() => {
      const errorText = screen.getByText(/Database error/);
      expect(errorText).toBeTruthy();
    });

    unmount();
  });

  it("should handle exception during save", async () => {
    const user = userEvent.setup();
    const consoleDebugSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});

    // Mock the GraphQL endpoint to throw exception
    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Handle GetDiaryEntry query
        if (query.includes("GetDiaryEntry")) {
          return HttpResponse.json(mockDiaryEntry);
        }

        // Handle UpdateDiaryEntry mutation by throwing network error
        if (query.includes("UpdateDiaryEntry")) {
          return HttpResponse.error();
        }

        return HttpResponse.json({ errors: [{ message: "Unknown query" }] });
      }),
    );

    const { unmount } = render(() => <DiaryEntryEditForm />);

    // Wait for the form to load
    await waitFor(() => {
      expect(screen.queryByLabelText("Servings")).not.toBeNull();
    });

    // Change servings
    const servingsInput = screen.getByLabelText("Servings") as HTMLInputElement;
    await user.clear(servingsInput);
    await user.type(servingsInput, "4");

    // Click the save button
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Wait for the error to be logged
    await waitFor(() => {
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    consoleDebugSpy.mockRestore();
    unmount();
  });

  it.skip("should navigate back without saving when nothing is changed", async () => {
    const user = userEvent.setup();

    // Mock the GraphQL endpoint
    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        const query: string = isGraphQLRequest(body) ? body.query : "";

        // Handle GetDiaryEntry query
        if (query.includes("GetDiaryEntry")) {
          return HttpResponse.json(mockDiaryEntry);
        }

        // This should not be called since nothing changed
        if (query.includes("UpdateDiaryEntry")) {
          throw new Error("Should not update when nothing changed");
        }

        return HttpResponse.json({ errors: [{ message: "Unknown query" }] });
      }),
    );

    const { unmount } = render(() => <DiaryEntryEditForm />);

    // Wait for the form to load
    await waitFor(() => {
      expect(screen.queryByLabelText("Servings")).not.toBeNull();
    });

    // Don't change anything, just click save
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Should navigate back - in the test, this will be visible as the form being disabled
    // or the component behaving as if navigation happened
    await waitFor(() => {
      // Button should be disabled since navigate() was called
      expect(saveButton.hasAttribute("disabled")).toBeTruthy();
    });

    unmount();
  });
});
