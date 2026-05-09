import { describe, it, expect } from "vitest";
import { entriesToCsv } from "./CSVExport";

const responseData = {
  data: {
    food_diary_diary_entry: [
      {
        servings: 1,
        consumed_at: "2022-08-28T14:30:00+00:00",
        nutrition_item: {
          description: "Honey Bunches of Oats",
          calories: 160,
          total_fat_grams: 2,
          saturated_fat_grams: 0,
          trans_fat_grams: 0,
          polyunsaturated_fat_grams: 0.5,
          monounsaturated_fat_grams: 1,
          cholesterol_milligrams: 0,
          sodium_milligrams: 190,
          total_carbohydrate_grams: 34,
          dietary_fiber_grams: 2,
          total_sugars_grams: 9,
          added_sugars_grams: 8,
          protein_grams: 3,
        },
        recipe: undefined,
      },
      {
        servings: 1,
        consumed_at: "2022-08-28T14:30:00+00:00",
        nutrition_item: {
          description: "Almondmilk",
          calories: 60,
          total_fat_grams: 2.5,
          saturated_fat_grams: 0,
          trans_fat_grams: 0,
          polyunsaturated_fat_grams: 0.5,
          monounsaturated_fat_grams: 1.5,
          cholesterol_milligrams: 0,
          sodium_milligrams: 150,
          total_carbohydrate_grams: 8,
          dietary_fiber_grams: 0,
          total_sugars_grams: 7,
          added_sugars_grams: 7,
          protein_grams: 1,
        },
        recipe: undefined,
      },
      {
        servings: 2,
        consumed_at: "2022-08-29T14:30:00+00:00",
        nutrition_item: undefined,
        recipe: {
          name: "Test Recipe",
          recipe_items: [
            {
              servings: 2,
              nutrition_item: {
                description: "Almondmilk",
                calories: 60,
                total_fat_grams: 2.5,
                saturated_fat_grams: 0,
                trans_fat_grams: 0,
                polyunsaturated_fat_grams: 0.5,
                monounsaturated_fat_grams: 1.5,
                cholesterol_milligrams: 0,
                sodium_milligrams: 150,
                total_carbohydrate_grams: 8,
                dietary_fiber_grams: 0,
                total_sugars_grams: 7,
                added_sugars_grams: 7,
                protein_grams: 1,
              },
            },
            {
              servings: 1,
              nutrition_item: {
                description: "Honey Bunches of Oats",
                calories: 160,
                total_fat_grams: 2,
                saturated_fat_grams: 0,
                trans_fat_grams: 0,
                polyunsaturated_fat_grams: 0.5,
                monounsaturated_fat_grams: 1,
                cholesterol_milligrams: 0,
                sodium_milligrams: 190,
                total_carbohydrate_grams: 34,
                dietary_fiber_grams: 2,
                total_sugars_grams: 9,
                added_sugars_grams: 8,
                protein_grams: 3,
              },
            },
          ],
        },
      },
    ],
  },
};

describe("entriesToCSV", () => {
  it("converts a list of entries to a csv log", () => {
    const entries = responseData.data.food_diary_diary_entry;
    expect(entriesToCsv(entries))
      .toEqual(`Date,Time,Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
2022-08-28,7:30 AM,2022-08-28T07:30:00-07:00,"Honey Bunches of Oats",1,160,2,0,0,0.5,1,0,190,34,2,9,8,3
2022-08-28,7:30 AM,2022-08-28T07:30:00-07:00,"Almondmilk",1,60,2.5,0,0,0.5,1.5,0,150,8,0,7,7,1
2022-08-29,7:30 AM,2022-08-29T07:30:00-07:00,"Test Recipe - Almondmilk",4,60,2.5,0,0,0.5,1.5,0,150,8,0,7,7,1
2022-08-29,7:30 AM,2022-08-29T07:30:00-07:00,"Test Recipe - Honey Bunches of Oats",2,160,2,0,0,0.5,1,0,190,34,2,9,8,3`);
  });

  it("quotes description field with special characters", () => {
    const entries = [
      {
        servings: 1,
        consumed_at: "2022-08-28T14:30:00+00:00",
        nutrition_item: {
          description: "Salad, mixed greens",
          calories: 20,
          total_fat_grams: 0,
          saturated_fat_grams: 0,
          trans_fat_grams: 0,
          polyunsaturated_fat_grams: 0,
          monounsaturated_fat_grams: 0,
          cholesterol_milligrams: 0,
          sodium_milligrams: 10,
          total_carbohydrate_grams: 4,
          dietary_fiber_grams: 2,
          total_sugars_grams: 1,
          added_sugars_grams: 0,
          protein_grams: 1,
        },
        recipe: undefined,
      },
    ];
    const csv = entriesToCsv(entries);
    // The description should be quoted because it contains a comma
    expect(csv).toContain('"Salad, mixed greens"');
  });

  it("escapes double quotes in description field", () => {
    const entries = [
      {
        servings: 1,
        consumed_at: "2022-08-28T14:30:00+00:00",
        nutrition_item: {
          description: 'Chocolate "Dark" Bar',
          calories: 200,
          total_fat_grams: 12,
          saturated_fat_grams: 7,
          trans_fat_grams: 0,
          polyunsaturated_fat_grams: 1,
          monounsaturated_fat_grams: 4,
          cholesterol_milligrams: 0,
          sodium_milligrams: 5,
          total_carbohydrate_grams: 20,
          dietary_fiber_grams: 3,
          total_sugars_grams: 15,
          added_sugars_grams: 14,
          protein_grams: 2,
        },
        recipe: undefined,
      },
    ];
    const csv = entriesToCsv(entries);
    // The description should have double quotes escaped as ""
    expect(csv).toContain('"Chocolate ""Dark"" Bar"');
  });

  it("handles entries with neither nutrition_item nor recipe", () => {
    const entries = [
      {
        servings: 1,
        consumed_at: "2022-08-28T14:30:00+00:00",
        nutrition_item: undefined,
        recipe: undefined,
      },
    ];
    const csv = entriesToCsv(entries);
    // Should only contain the header row since the entry is skipped
    const lines = csv.split("\n");
    expect(lines.length).toBe(1); // Only header
    expect(lines[0]).toContain("Date,Time,Consumed At");
  });
});
