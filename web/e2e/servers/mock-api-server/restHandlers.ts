/**
 * Canned responses for the two LLM REST endpoints. Real values would come
 * from an actual vision/text model (llm-nutrition-api); the mock just needs
 * something deterministic an E2E test can assert specific numbers against.
 */

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function inRange(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1));
}

/** POST /lookup -- deterministic, keyed off the description text so a test
 * can compute the same expected values independently. */
export function handleLookup(description: string): {
  item: Record<string, unknown>;
} {
  const seed = hashString(description);
  return {
    item: {
      description,
      calories: inRange(seed, 50, 500),
      total_fat_grams: inRange(seed >>> 1, 0, 20),
      saturated_fat_grams: inRange(seed >>> 2, 0, 10),
      trans_fat_grams: 0,
      polyunsaturated_fat_grams: inRange(seed >>> 3, 0, 5),
      monounsaturated_fat_grams: inRange(seed >>> 4, 0, 5),
      cholesterol_milligrams: inRange(seed >>> 5, 0, 100),
      sodium_milligrams: inRange(seed >>> 6, 0, 800),
      total_carbohydrate_grams: inRange(seed >>> 7, 0, 60),
      dietary_fiber_grams: inRange(seed >>> 8, 0, 10),
      total_sugars_grams: inRange(seed >>> 9, 0, 30),
      added_sugars_grams: inRange(seed >>> 10, 0, 20),
      protein_grams: inRange(seed >>> 11, 0, 40),
    },
  };
}

/** POST /upload -- fixed canned values (the mock camera "always sees" the
 * same label). Note the different key naming convention from /lookup
 * (`cholesterol_mg` not `cholesterol_milligrams`, etc.) -- this faithfully
 * reproduces the real app's existing (if inconsistent) contract; see
 * CameraModal.tsx's parsing vs. Api.ts's lookupNutritionWithLLM. */
export function handleUpload(): { image: Record<string, unknown> } {
  return {
    image: {
      description: "Mock Scanned Nutrition Label",
      calories: 210,
      total_fat_grams: 8,
      saturated_fat_grams: 3,
      trans_fat_grams: 0,
      polyunsaturated_fat_grams: 1,
      monounsaturated_fat_grams: 2,
      cholesterol_mg: 15,
      sodium_mg: 340,
      total_carbohydrates_g: 27,
      dietary_fiber_g: 3,
      total_sugars_g: 9,
      added_sugars_g: 4,
      protein_g: 6,
    },
  };
}
