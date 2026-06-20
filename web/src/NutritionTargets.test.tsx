import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@solidjs/testing-library";
import {
  NutritionTargetsProvider,
  useNutritionTargets,
  DEFAULT_TARGETS,
  type NutritionTargets,
} from "./NutritionTargets";
import * as Api from "./Api";

vi.mock("./Api", () => ({
  fetchNutritionTargets: vi.fn(),
  setNutritionTargets: vi.fn(),
}));

type ContextValue = ReturnType<typeof useNutritionTargets>;

function renderProvider(): ContextValue {
  let captured!: ContextValue;
  function Consumer() {
    captured = useNutritionTargets();
    return null;
  }
  render(() => (
    <NutritionTargetsProvider>
      <Consumer />
    </NutritionTargetsProvider>
  ));
  return captured;
}

const STORAGE_KEY = "nutrition_targets";

describe("NutritionTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("defaults to DEFAULT_TARGETS when localStorage is empty", () => {
    const [targets] = renderProvider();
    expect(targets()).toEqual(DEFAULT_TARGETS);
  });

  it("seeds the initial signal from localStorage when present", () => {
    const stored: NutritionTargets = {
      ...DEFAULT_TARGETS,
      calories: 1800,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const [targets] = renderProvider();
    expect(targets().calories).toBe(1800);
  });

  it("uses backend targets when the server already has a row", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_TARGETS, calories: 9999 }),
    );
    const backendRow: NutritionTargets = {
      calories: 2100,
      calories_max: 2500,
      protein_grams: 140,
      dietary_fiber_grams: 30,
      added_sugars_grams: 20,
    };
    vi.mocked(Api.fetchNutritionTargets).mockResolvedValue({
      data: { food_diary_nutrition_target: [backendRow] },
    });

    const [targets, , syncFromBackend] = renderProvider();
    await syncFromBackend("test-token");

    expect(targets()).toEqual(backendRow);
    expect(Api.setNutritionTargets).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("migrates localStorage targets to the backend when the server has no row", async () => {
    const stored: NutritionTargets = {
      ...DEFAULT_TARGETS,
      calories: 1750,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    vi.mocked(Api.fetchNutritionTargets).mockResolvedValue({
      data: { food_diary_nutrition_target: [] },
    });
    vi.mocked(Api.setNutritionTargets).mockResolvedValue(undefined);

    const [targets, , syncFromBackend] = renderProvider();
    await syncFromBackend("test-token");

    expect(Api.setNutritionTargets).toHaveBeenCalledWith("test-token", stored);
    expect(targets()).toEqual(stored);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does nothing when the server has no row and localStorage is empty", async () => {
    vi.mocked(Api.fetchNutritionTargets).mockResolvedValue({
      data: { food_diary_nutrition_target: [] },
    });

    const [targets, , syncFromBackend] = renderProvider();
    await syncFromBackend("test-token");

    expect(Api.setNutritionTargets).not.toHaveBeenCalled();
    expect(targets()).toEqual(DEFAULT_TARGETS);
  });

  it("updateTargets saves to the backend and updates the in-memory signal", async () => {
    vi.mocked(Api.setNutritionTargets).mockResolvedValue(undefined);

    const [targets, updateTargets] = renderProvider();
    await updateTargets({ calories: 2300 }, "test-token");

    expect(Api.setNutritionTargets).toHaveBeenCalledWith("test-token", {
      ...DEFAULT_TARGETS,
      calories: 2300,
    });
    expect(targets().calories).toBe(2300);
  });
});
