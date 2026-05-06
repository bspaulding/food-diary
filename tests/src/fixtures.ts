// Minimal nutrition item object for inserts. All NOT NULL fields required.
export const CHICKEN_BREAST = {
  description: 'Chicken Breast',
  calories: 165,
  total_fat_grams: 3.6,
  saturated_fat_grams: 1.0,
  trans_fat_grams: 0,
  polyunsaturated_fat_grams: 0.8,
  monounsaturated_fat_grams: 1.2,
  cholesterol_milligrams: 85,
  sodium_milligrams: 74,
  total_carbohydrate_grams: 0,
  dietary_fiber_grams: 0,
  total_sugars_grams: 0,
  added_sugars_grams: 0,
  protein_grams: 31,
};

export const BROWN_RICE = {
  description: 'Brown Rice',
  calories: 216,
  total_fat_grams: 1.8,
  saturated_fat_grams: 0.4,
  trans_fat_grams: 0,
  polyunsaturated_fat_grams: 0.7,
  monounsaturated_fat_grams: 0.7,
  cholesterol_milligrams: 0,
  sodium_milligrams: 10,
  total_carbohydrate_grams: 45,
  dietary_fiber_grams: 3.5,
  total_sugars_grams: 0.7,
  added_sugars_grams: 0,
  protein_grams: 5,
};

// recipe: 2 servings of chicken breast + 1 serving of brown rice, total_servings = 2
// calories per serving = (2*165 + 1*216) / 2 = 273
export const CHICKEN_BOWL_TOTAL_SERVINGS = 2;
export const CHICKEN_BOWL_CALORIES_PER_SERVING = 273;

// Timestamps chosen so:
//   - both dates fall in ISO week 3 of 2024 (Jan 15–21)
//   - hour values are predictable for top_entries_around_hour tests
export const TS_DAY1_HOUR8 = '2024-01-15T08:00:00+00:00';  // hour 8
export const TS_DAY1_HOUR12 = '2024-01-15T12:00:00+00:00'; // hour 12
export const TS_DAY1_HOUR18 = '2024-01-15T18:00:00+00:00'; // hour 18
export const TS_DAY2_HOUR8 = '2024-01-16T08:00:00+00:00';  // hour 8

export const DATE_DAY1 = '2024-01-15';
export const DATE_DAY2 = '2024-01-16';

// Expected computed field values:
// entry1: chicken breast × 1.5 servings → calories = 247.5
// entry2: brown rice × 1 serving        → calories = 216
// entry3: recipe × 1 serving            → calories = 273
// entry4: chicken breast × 2 servings   → calories = 330
export const CALORIES_ENTRY1 = 1.5 * 165;   // 247.5
export const CALORIES_ENTRY2 = 1 * 216;     // 216
export const CALORIES_ENTRY3 = 1 * 273;     // 273
export const CALORIES_ENTRY4 = 2 * 165;     // 330

// calories_per_day
export const CALORIES_DAY1 = CALORIES_ENTRY1 + CALORIES_ENTRY2 + CALORIES_ENTRY3; // 736.5
export const CALORIES_DAY2 = CALORIES_ENTRY4; // 330

// trends_weekly (week 3, all 4 entries):
// recipe_protein = sum(ri.servings * ni.protein_grams)  [no /total_servings — matches SQL]
//               = 2*31 + 1*5 = 67
// protein per entry: 46.5, 5, 67, 62
export const RECIPE_PROTEIN_TOTAL = 2 * 31 + 1 * 5; // 67 (intentionally not divided by servings)
export const WEEKLY_AVG_CALORIES =
  (CALORIES_ENTRY1 + CALORIES_ENTRY2 + CALORIES_ENTRY3 + CALORIES_ENTRY4) / 4; // 266.625
export const WEEKLY_AVG_PROTEIN =
  (1.5 * 31 + 1 * 5 + 1 * RECIPE_PROTEIN_TOTAL + 2 * 31) / 4; // 45.125
