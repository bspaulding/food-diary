import { parseISO, format, formatISO } from "date-fns";

const header = [
  "Date",
  "Time",
  "Consumed At",
  "Description",
  "Servings",
  "Calories",
  "Total Fat (g)",
  "Saturated Fat (g)",
  "Trans Fat (g)",
  "Polyunsaturated Fat (g)",
  "Monounsaturated Fat (g)",
  "Cholesterol (mg)",
  "Sodium (mg)",
  "Total Carbohydrate (g)",
  "Dietary Fiber (g)",
  "Total Sugars (g)",
  "Added Sugars (g)",
  "Protein (g)",
];

const DESCRIPTION_COLUMN_INDEX = header.indexOf("Description");

const headerKeyMap: Record<string, string[]> = {
  "Consumed At": ["consumed_at"],
  Description: ["nutrition_item", "description"],
  Servings: ["servings"],
  Calories: ["nutrition_item", "calories"],
  "Total Fat (g)": ["nutrition_item", "total_fat_grams"],
  "Saturated Fat (g)": ["nutrition_item", "saturated_fat_grams"],
  "Trans Fat (g)": ["nutrition_item", "trans_fat_grams"],
  "Polyunsaturated Fat (g)": ["nutrition_item", "polyunsaturated_fat_grams"],
  "Monounsaturated Fat (g)": ["nutrition_item", "monounsaturated_fat_grams"],
  "Cholesterol (mg)": ["nutrition_item", "cholesterol_milligrams"],
  "Sodium (mg)": ["nutrition_item", "sodium_milligrams"],
  "Total Carbohydrate (g)": ["nutrition_item", "total_carbohydrate_grams"],
  "Dietary Fiber (g)": ["nutrition_item", "dietary_fiber_grams"],
  "Total Sugars (g)": ["nutrition_item", "total_sugars_grams"],
  "Added Sugars (g)": ["nutrition_item", "added_sugars_grams"],
  "Protein (g)": ["nutrition_item", "protein_grams"],
};

type NutritionItemRecord = {
  [key: string]: unknown;
};

type RecipeRecord = {
  name: string;
  recipe_items: Array<{
    servings: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type EntryRecord = {
  consumed_at: string;
  servings: number;
  nutrition_item?: NutritionItemRecord;
  recipe?: RecipeRecord;
  [key: string]: unknown;
};

export type { EntryRecord };

export function entriesToCsv(entries: EntryRecord[]): string {
  return stringsToCsv([
    header,
    ...entries.flatMap((entry: EntryRecord) => {
      const nutritionItem = entry.nutrition_item;
      const recipe = entry.recipe;

      if (nutritionItem !== undefined && nutritionItem !== null) {
        return [
          header.map((key: string): string => {
            const consumedAt: Date = parseISO(
              String(getPath(headerKeyMap["Consumed At"], entry)),
            );
            switch (key) {
              case "Date":
                return format(consumedAt, "yyyy-MM-dd");
              case "Time":
                return format(consumedAt, "p");
              case "Consumed At":
                return formatISO(consumedAt);
              default:
                return String(getPath(headerKeyMap[key], entry));
            }
          }),
        ];
      } else if (recipe) {
        return recipe.recipe_items.map(
          (recipe_item: { servings: number; [key: string]: unknown }) => {
            return header.map((key: string): string => {
              const consumedAt: Date = parseISO(
                String(getPath(headerKeyMap["Consumed At"], entry)),
              );
              const entryServings = entry.servings;
              const itemServings = recipe_item.servings;
              switch (key) {
                case "Date":
                  return format(consumedAt, "yyyy-MM-dd");
                case "Time":
                  return format(consumedAt, "p");
                case "Consumed At":
                  return formatISO(consumedAt);
                case "Servings":
                  return String(entryServings * itemServings);
                case "Description":
                  const itemName: string = String(
                    getPath(headerKeyMap[key], recipe_item),
                  );
                  return `${recipe.name} - ${itemName}`;
                default:
                  return String(getPath(headerKeyMap[key], recipe_item));
              }
            });
          },
        );
      }
      return [];
    }),
  ]);
}

function stringsToCsv(rows: string[][]): string {
  return rows
    .map((row: string[], rowIndex: number) => {
      return row
        .map((cell: string, cellIndex: number) => {
          // Quote the Description field in data rows (not in header row)
          if (rowIndex > 0 && cellIndex === DESCRIPTION_COLUMN_INDEX) {
            // Escape double quotes by doubling them (CSV RFC 4180)
            const escapedCell: string = String(cell).replace(/"/g, '""');
            return `"${escapedCell}"`;
          }
          return `${cell}`;
        })
        .join(",");
    })
    .join("\n")
    .trim();
}

function getPath(
  path: string[],
  x: EntryRecord | NutritionItemRecord | { [key: string]: unknown },
): string | number {
  type PathValue = string | number | { [key: string]: unknown };
  return path.reduce<PathValue>((acc: PathValue, k: string) => {
    if (typeof acc === "object" && acc !== null && k in acc) {
      const val = (acc as Record<string, unknown>)[k];
      if (
        typeof val === "string" ||
        typeof val === "number" ||
        (typeof val === "object" && val !== null)
      ) {
        return val as PathValue;
      }
    }
    return acc;
  }, x as PathValue) as string | number;
}
