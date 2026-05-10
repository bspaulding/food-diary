import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import LLMLookupModal from "./LLMLookupModal";
import * as Api from "./Api";

vi.mock("./Api", () => ({
  lookupNutritionWithLLM: vi.fn(),
}));

const mockLookup = vi.mocked(Api.lookupNutritionWithLLM);

const sampleNutritionData: Partial<Api.NutritionItemAttrs> = {
  description: "Grilled chicken breast",
  calories: 165,
  totalFatGrams: 3.6,
  saturatedFatGrams: 1.0,
  transFatGrams: 0,
  polyunsaturatedFatGrams: 0.8,
  monounsaturatedFatGrams: 1.2,
  cholesterolMilligrams: 85,
  sodiumMilligrams: 74,
  totalCarbohydrateGrams: 0,
  dietaryFiberGrams: 0,
  totalSugarsGrams: 0,
  addedSugarsGrams: 0,
  proteinGrams: 31,
};

describe("LLMLookupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders when isOpen is true", () => {
    render(() => (
      <LLMLookupModal isOpen={true} onClose={() => {}} onImport={() => {}} />
    ));
    expect(screen.getByText("Look Up Nutrition")).toBeTruthy();
    expect(screen.getByText("Look Up")).toBeTruthy();
  });

  it("does not render when isOpen is false", () => {
    render(() => (
      <LLMLookupModal isOpen={false} onClose={() => {}} onImport={() => {}} />
    ));
    expect(screen.queryByText("Look Up Nutrition")).toBeFalsy();
  });

  it("calls lookupNutritionWithLLM with the typed query on submit", async () => {
    const user = userEvent.setup();
    mockLookup.mockResolvedValue(sampleNutritionData);

    render(() => (
      <LLMLookupModal isOpen={true} onClose={() => {}} onImport={() => {}} />
    ));

    const textarea = screen.getByPlaceholderText(
      "e.g. 2 scrambled eggs and whole wheat toast",
    );
    await user.type(textarea, "100g grilled chicken breast");
    await user.click(screen.getByText("Look Up"));

    await waitFor(() => {
      expect(mockLookup).toHaveBeenCalledWith("100g grilled chicken breast");
    });
  });

  it("shows loading state while lookup is in progress", async () => {
    const user = userEvent.setup();
    let resolvePromise!: (value: Partial<Api.NutritionItemAttrs>) => void;
    mockLookup.mockReturnValue(
      new Promise<Partial<Api.NutritionItemAttrs>>((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(() => (
      <LLMLookupModal isOpen={true} onClose={() => {}} onImport={() => {}} />
    ));

    const textarea = screen.getByPlaceholderText(
      "e.g. 2 scrambled eggs and whole wheat toast",
    );
    await user.type(textarea, "2 eggs");
    await user.click(screen.getByText("Look Up"));

    await waitFor(() => {
      expect(screen.getByText("Looking up...")).toBeTruthy();
    });

    resolvePromise(sampleNutritionData);
  });

  it("calls onImport with result and closes modal on success", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onClose = vi.fn();
    mockLookup.mockResolvedValue(sampleNutritionData);

    render(() => (
      <LLMLookupModal isOpen={true} onClose={onClose} onImport={onImport} />
    ));

    const textarea = screen.getByPlaceholderText(
      "e.g. 2 scrambled eggs and whole wheat toast",
    );
    await user.type(textarea, "100g grilled chicken");
    await user.click(screen.getByText("Look Up"));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith(sampleNutritionData);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("displays error message when lookup fails", async () => {
    const user = userEvent.setup();
    mockLookup.mockRejectedValue(new Error("Service unavailable"));

    render(() => (
      <LLMLookupModal isOpen={true} onClose={() => {}} onImport={() => {}} />
    ));

    const textarea = screen.getByPlaceholderText(
      "e.g. 2 scrambled eggs and whole wheat toast",
    );
    await user.type(textarea, "some food");
    await user.click(screen.getByText("Look Up"));

    await waitFor(() => {
      expect(screen.getByText("Service unavailable")).toBeTruthy();
    });
  });

  it("closes modal when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(() => (
      <LLMLookupModal isOpen={true} onClose={onClose} onImport={() => {}} />
    ));

    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
