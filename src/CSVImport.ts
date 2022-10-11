import { parse as parseCSVString } from "csv-parse/browser/esm/sync";
import { parseISO as parseDate, formatISO } from "date-fns";
import { Either, Left, Right } from "./Either";
import { NewDiaryEntry } from "./Api";

export function parseCSV(csv: string) {
  const lines = parseCSVString(csv);
  const header = lines[0];
  const rows = lines.slice(1);
  return rows.map((row: string[]) =>
    row.reduce(
      (acc, cell, i) => ({
        ...acc,
        [header[i]]: cell,
      }),
      {}
    )
  );
}

function parseNumber(parser: (x: any, d: number) => number, value: any) {
  const parsed = parser(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export function rowToEntry(row: string[]): Either<object, NewDiaryEntry> {
  try {
    const consumed_at = parseDate(row["Consumed At"]);
    if (isNaN(consumed_at)) {
      return Left("Invalid Consumed At Date");
    }
    return Right({
      consumed_at: formatISO(consumed_at),
      servings: parseFloat(row["Servings"], 10),
      nutrition_item: {
        description: row["Description"],
        calories: parseNumber(parseInt, row["Calories"]),
        totalFatGrams: parseNumber(parseFloat, row["Total Fat (g)"]),
        saturatedFatGrams: parseNumber(parseFloat, row["Saturated Fat (g)"]),
        transFatGrams: parseNumber(parseFloat, row["Trans Fat (g)"]),
        polyunsaturatedFatGrams: parseNumber(
          parseFloat,
          row["Polyunsaturated Fat (g)"]
        ),
        monounsaturatedFatGrams: parseNumber(
          parseFloat,
          row["Monounsaturated Fat (g)"]
        ),
        cholesterolMilligrams: parseNumber(parseFloat, row["Cholesterol (mg)"]),
        sodiumMilligrams: parseNumber(parseFloat, row["Sodium (mg)"]),
        totalCarbohydrateGrams: parseNumber(
          parseFloat,
          row["Total Carbohydrate (g)"]
        ),
        dietaryFiberGrams: parseNumber(parseFloat, row["Dietary Fiber (g)"]),
        totalSugarsGrams: parseNumber(parseFloat, row["Total Sugars (g)"]),
        addedSugarsGrams: parseNumber(parseFloat, row["Added Sugars (g)"]),
        proteinGrams: parseNumber(parseFloat, row["Protein (g)"]),
      },
    });
  } catch (e: any) {
    return Left({ error: e, row });
  }
}
