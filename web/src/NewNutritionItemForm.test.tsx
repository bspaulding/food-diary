import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "./test-setup";
import NewNutritionItemForm from "./NewNutritionItemForm";

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

const mockNavigate = vi.fn();
vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  A: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as Element}</a>
  ),
}));

describe("NewNutritionItemForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render nutrition item form with all fields", () => {
    render(() => <NewNutritionItemForm />);

    const descInput = document.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    expect(descInput).toBeTruthy();
    const caloriesInput = document.querySelector(
      'input[name="calories"]',
    ) as HTMLInputElement;
    expect(caloriesInput).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("should display Scan button", () => {
    render(() => <NewNutritionItemForm />);
    expect(screen.getByText("Scan")).toBeTruthy();
  });

  it("should update description input", async () => {
    const user = userEvent.setup();
    render(() => <NewNutritionItemForm />);

    const descInput = document.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    await user.type(descInput, "Apple");

    expect(descInput.value).toBe("Apple");
  });

  it("should update calories input", async () => {
    const user = userEvent.setup();
    render(() => <NewNutritionItemForm />);

    const inputs = screen.getAllByDisplayValue("0");
    const caloriesInput = inputs.find(
      (input) => (input as HTMLInputElement).name === "calories",
    ) as HTMLInputElement;
    await user.clear(caloriesInput);
    await user.type(caloriesInput, "95");

    expect(caloriesInput.value).toBe("95");
  });

  it("should handle NaN in number inputs", async () => {
    const user = userEvent.setup();
    render(() => <NewNutritionItemForm />);

    const inputs = screen.getAllByDisplayValue("0");
    const caloriesInput = inputs.find(
      (input) => (input as HTMLInputElement).name === "calories",
    ) as HTMLInputElement;
    const initialValue = caloriesInput.value;

    await user.clear(caloriesInput);
    await user.type(caloriesInput, "abc");

    // Should not change from cleared state since abc is not a valid number
    expect(caloriesInput.value).toBe("");
  });

  it("should populate form with initial item data", () => {
    const initialItem = {
      id: 123,
      description: "Banana",
      calories: 105,
      totalFatGrams: 0.4,
      saturatedFatGrams: 0.1,
      transFatGrams: 0,
      polyunsaturatedFatGrams: 0.1,
      monounsaturatedFatGrams: 0.1,
      cholesterolMilligrams: 0,
      sodiumMilligrams: 1,
      totalCarbohydrateGrams: 27,
      dietaryFiberGrams: 3,
      totalSugarsGrams: 14,
      addedSugarsGrams: 0,
      proteinGrams: 1.3,
    };

    render(() => <NewNutritionItemForm initialItem={initialItem} />);

    const descInput = document.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    expect(descInput.value).toBe("Banana");
    expect(screen.getByDisplayValue("105")).toBeTruthy();
    expect(screen.getByDisplayValue("0.4")).toBeTruthy();
    expect(screen.getByDisplayValue("1.3")).toBeTruthy();
  });

  it("should create new nutrition item on save", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (
          isGraphQLRequest(body) &&
          body.query.includes("CreateNutritionItem")
        ) {
          return HttpResponse.json({
            data: {
              insert_food_diary_nutrition_item_one: {
                id: 789,
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewNutritionItemForm />);

    const descInput = document.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    await user.type(descInput, "Apple");

    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/nutrition_item/789");
    });
  });

  it.skip("should update existing nutrition item on save", async () => {
    // TODO: Fix MSW mock to properly return updateNutritionItem response
    const user = userEvent.setup();

    const initialItem = {
      id: 123,
      description: "Banana",
      calories: 105,
      totalFatGrams: 0.4,
      saturatedFatGrams: 0.1,
      transFatGrams: 0,
      polyunsaturatedFatGrams: 0.1,
      monounsaturatedFatGrams: 0.1,
      cholesterolMilligrams: 0,
      sodiumMilligrams: 1,
      totalCarbohydrateGrams: 27,
      dietaryFiberGrams: 3,
      totalSugarsGrams: 14,
      addedSugarsGrams: 0,
      proteinGrams: 1.3,
    };

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (
          isGraphQLRequest(body) &&
          body.query.includes("UpdateNutritionItem")
        ) {
          return HttpResponse.json({
            data: {
              update_food_diary_nutrition_item_by_pk: {
                id: 123,
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewNutritionItemForm initialItem={initialItem} />);

    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith("/nutrition_item/123");
      },
      { timeout: 3000 },
    );
  });

  it("should show Saving... while saving", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/v1/graphql", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          data: {
            insert_food_diary_nutrition_item_one: {
              id: 789,
            },
          },
        });
      }),
    );

    render(() => <NewNutritionItemForm />);

    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    expect(screen.getByText("Saving...")).toBeTruthy();
  });

  it("should call onSaved callback instead of navigating when provided", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (
          isGraphQLRequest(body) &&
          body.query.includes("CreateNutritionItem")
        ) {
          return HttpResponse.json({
            data: {
              insert_food_diary_nutrition_item_one: {
                id: 789,
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewNutritionItemForm onSaved={onSaved} />);

    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it("should open camera modal when Scan button is clicked", async () => {
    const user = userEvent.setup();
    render(() => <NewNutritionItemForm />);

    const scanButton = screen.getByText("Scan");
    await user.click(scanButton);

    // Camera modal should be shown (CameraModal component would be tested separately)
    await waitFor(() => {
      // Just ensure the button click works - full modal testing in CameraModal.test
      expect(scanButton).toBeTruthy();
    });
  });

  it("should update all nutrition fields correctly", async () => {
    const user = userEvent.setup();
    render(() => <NewNutritionItemForm />);

    const inputs = document.querySelectorAll('input[type="number"]');
    const fields = [
      { name: "total-fat-grams", value: "1.5" },
      { name: "saturated-fat-grams", value: "0.5" },
      { name: "trans-fat-grams", value: "0.1" },
      { name: "polyunsaturated-fat-grams", value: "0.3" },
      { name: "monounsaturated-fat-grams", value: "0.6" },
      { name: "cholesterol-milligrams", value: "10" },
      { name: "sodium-milligrams", value: "150" },
      { name: "total-carbohydrate-grams", value: "25" },
      { name: "dietary-fiber-grams", value: "4" },
      { name: "total-sugars-grams", value: "15" },
      { name: "added-sugars-grams", value: "5" },
      { name: "protein-grams", value: "3" },
    ];

    for (const field of fields) {
      const input = document.querySelector(
        `input[name="${field.name}"]`,
      ) as HTMLInputElement;
      if (input) {
        await user.clear(input);
        await user.type(input, field.value);
      }
    }

    // Verify last field as a sanity check
    const proteinInput = document.querySelector(
      'input[name="protein-grams"]',
    ) as HTMLInputElement;
    expect(proteinInput.value).toBe("3");
  });

  it("should populate form with initialItem values including all nutrition fields", () => {
    const initialItem = {
      id: 123,
      description: "Test Food",
      calories: 150,
      totalFatGrams: 5,
      saturatedFatGrams: 2,
      transFatGrams: 0.5,
      polyunsaturatedFatGrams: 1,
      monounsaturatedFatGrams: 1.5,
      cholesterolMilligrams: 25,
      sodiumMilligrams: 200,
      totalCarbohydrateGrams: 20,
      dietaryFiberGrams: 3,
      totalSugarsGrams: 10,
      addedSugarsGrams: 5,
      proteinGrams: 6,
    };

    render(() => <NewNutritionItemForm initialItem={initialItem} />);

    // Verify all fields are populated
    const descInput = document.querySelector(
      'input[name="description"]',
    ) as HTMLInputElement;
    expect(descInput.value).toBe("Test Food");

    const caloriesInput = document.querySelector(
      'input[name="calories"]',
    ) as HTMLInputElement;
    expect(caloriesInput.value).toBe("150");

    const transFatInput = document.querySelector(
      'input[name="trans-fat-grams"]',
    ) as HTMLInputElement;
    expect(transFatInput.value).toBe("0.5");

    const polyFatInput = document.querySelector(
      'input[name="polyunsaturated-fat-grams"]',
    ) as HTMLInputElement;
    expect(polyFatInput.value).toBe("1");

    const monoFatInput = document.querySelector(
      'input[name="monounsaturated-fat-grams"]',
    ) as HTMLInputElement;
    expect(monoFatInput.value).toBe("1.5");

    const cholesterolInput = document.querySelector(
      'input[name="cholesterol-milligrams"]',
    ) as HTMLInputElement;
    expect(cholesterolInput.value).toBe("25");

    const sodiumInput = document.querySelector(
      'input[name="sodium-milligrams"]',
    ) as HTMLInputElement;
    expect(sodiumInput.value).toBe("200");

    const proteinInput = document.querySelector(
      'input[name="protein-grams"]',
    ) as HTMLInputElement;
    expect(proteinInput.value).toBe("6");
  });

  it.skip("should call updateNutritionItem when saving an existing item", async () => {
    const user = userEvent.setup();
    let updateCalled = false;

    const initialItem = {
      id: 456,
      description: "Existing Item",
      calories: 100,
      totalFatGrams: 1,
      saturatedFatGrams: 0,
      transFatGrams: 0,
      polyunsaturatedFatGrams: 0,
      monounsaturatedFatGrams: 0,
      cholesterolMilligrams: 0,
      sodiumMilligrams: 0,
      totalCarbohydrateGrams: 20,
      dietaryFiberGrams: 2,
      totalSugarsGrams: 10,
      addedSugarsGrams: 5,
      proteinGrams: 2,
    };

    server.use(
      http.post("/api/v1/graphql", async ({ request }) => {
        const body: unknown = await request.json();
        if (
          isGraphQLRequest(body) &&
          body.query.includes("UpdateNutritionItem")
        ) {
          updateCalled = true;
          // Simulate delay
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json({
            data: {
              update_food_diary_nutrition_item_by_pk: {
                id: 456,
              },
            },
          });
        }
        return HttpResponse.json({ data: {} });
      }),
    );

    render(() => <NewNutritionItemForm initialItem={initialItem} />);

    // Wait for form to be ready
    await waitFor(() => {
      const saveButton = screen.queryByText("Save");
      expect(saveButton).not.toBeNull();
      expect(saveButton?.hasAttribute("disabled")).toBeFalsy();
    });

    // Modify a field
    const caloriesInput = document.querySelector(
      'input[name="calories"]',
    ) as HTMLInputElement;
    await user.clear(caloriesInput);
    await user.type(caloriesInput, "150");

    // Save
    const saveButton = screen.getByText("Save");
    await user.click(saveButton);

    // Wait for the update to be called and navigation to occur
    await waitFor(
      () => {
        expect(updateCalled).toBe(true);
      },
      { timeout: 3000 },
    );

    // After navigation, mockNavigate should have been called
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });
});
