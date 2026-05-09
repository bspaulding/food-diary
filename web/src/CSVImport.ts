import { parse as parseCSVString } from "csv-parse/browser/esm/sync";
import { parseISO as parseDate, formatISO } from "date-fns";
import { Either, Left, Right } from "./Either";
import { NewDiaryEntry } from "./Api";

export type ParsedRow = Record<string, string>;

export function parseCSV(csv: string): ParsedRow[] {
  const lines: string[][] = parseCSVString(csv);
  const header: string[] = lines[0];
  const rows: string[][] = lines.slice(1);
  return rows.map((row: string[]) =>
    row.reduce(
      (acc: ParsedRow, cell: string, i: number) => ({
        ...acc,
        [header[i]]: cell,
      }),
      {} as ParsedRow,
    ),
  );
}

function parseNumber(
  parser: (x: string, d: number) => number,
  value: string,
): number {
  const parsed: number = parser(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export function rowToEntry(
  row: Record<string, string>,
): Either<Record<string, unknown>, NewDiaryEntry> {
  try {
    const consumed_at: Date = parseDate(row["Consumed At"]);
    if (isNaN(consumed_at.getTime())) {
      return Left({ error: "Invalid Consumed At Date" });
    }
    return Right({
      consumed_at: formatISO(consumed_at),
      servings: parseFloat(row["Servings"]),
      nutrition_item: {
        description: row["Description"],
        calories: parseNumber(parseInt, row["Calories"]),
        totalFatGrams: parseNumber(parseFloat, row["Total Fat (g)"]),
        saturatedFatGrams: parseNumber(parseFloat, row["Saturated Fat (g)"]),
        transFatGrams: parseNumber(parseFloat, row["Trans Fat (g)"]),
        polyunsaturatedFatGrams: parseNumber(
          parseFloat,
          row["Polyunsaturated Fat (g)"],
        ),
        monounsaturatedFatGrams: parseNumber(
          parseFloat,
          row["Monounsaturated Fat (g)"],
        ),
        cholesterolMilligrams: parseNumber(parseFloat, row["Cholesterol (mg)"]),
        sodiumMilligrams: parseNumber(parseFloat, row["Sodium (mg)"]),
        totalCarbohydrateGrams: parseNumber(
          parseFloat,
          row["Total Carbohydrate (g)"],
        ),
        dietaryFiberGrams: parseNumber(parseFloat, row["Dietary Fiber (g)"]),
        totalSugarsGrams: parseNumber(parseFloat, row["Total Sugars (g)"]),
        addedSugarsGrams: parseNumber(parseFloat, row["Added Sugars (g)"]),
        proteinGrams: parseNumber(parseFloat, row["Protein (g)"]),
      },
    });
  } catch (e: unknown) {
    return Left({ error: e instanceof Error ? e : new Error(String(e)), row });
  }
}
