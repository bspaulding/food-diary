import type { Component } from "solid-js";
import { createSignal, Index, Show } from "solid-js";
import { format, parseISO } from "date-fns";
import type { NewDiaryEntry } from "./Api";
import type { Either } from "./Either";
import { isRight, isLeft } from "./Either";
import { useAuth } from "./Auth0";
import { insertDiaryEntries } from "./Api";
import ButtonLink from "./ButtonLink";
import { parseCSV, rowToEntry, ParsedRow } from "./CSVImport";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function readFile(file: File): Promise<string> {
  return new Promise<string>(
    (resolve: (value: string) => void, reject: (reason?: unknown) => void) => {
      const reader: FileReader = new FileReader();
      reader.addEventListener("load", (event: ProgressEvent<FileReader>) => {
        if (event.target && typeof event.target.result === "string") {
          resolve(event.target.result);
        } else {
          reject(new Error("Failed to read file"));
        }
      });
      reader.addEventListener("error", reject);
      reader.readAsText(file);
    },
  );
}

const ImportDiaryEntries: Component = () => {
  const [parseResult, setParseResult] = createSignal<{
    parsed?: boolean;
    lefts: object[];
    rights: NewDiaryEntry[];
  }>({ lefts: [], rights: [] });
  const [{ accessToken }] = useAuth();
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [importError, setImportError] = createSignal<string | null>(null);

  const fileChanged = async (event: Event): Promise<void> => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const file: File | undefined = target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const csv: string = await readFile(file);
      const rows: ParsedRow[] = parseCSV(csv);
      const entries: Either<object, NewDiaryEntry>[] = rows.map(rowToEntry);

      const { lefts, rights }: { lefts: object[]; rights: NewDiaryEntry[] } =
        entries.reduce(
          (
            acc: { lefts: object[]; rights: NewDiaryEntry[] },
            entry: Either<object, NewDiaryEntry>,
          ) => {
            if (isLeft(entry)) {
              return { ...acc, lefts: [...acc.lefts, entry.value] };
            } else if (isRight(entry)) {
              return { ...acc, rights: [...acc.rights, entry.value] };
            }
            return acc;
          },
          { lefts: [] as object[], rights: [] as NewDiaryEntry[] },
        );

      console.log({ lefts, rights });
      setParseResult({ parsed: true, lefts, rights });
    } catch (error: unknown) {
      console.error("CSV file processing failed:", error);
      const message =
        error instanceof Error ? error.message : "Failed to process CSV file";
      setImportError(message);
    }
  };

  const startImport = async (e: Event): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setImportError(null);
    try {
      const response: GraphQLResponse<{
        insert_food_diary_diary_entry?: { affected_rows: number };
      }> = await insertDiaryEntries(accessToken(), parseResult().rights);
      setSaving(false);
      setSaved(!!response.data);
    } catch (error: unknown) {
      console.error("CSV import failed:", error);
      setSaving(false);
      const message: string =
        error instanceof Error
          ? error.message
          : "An error occurred during import";
      setImportError(message);
    }
  };

  return (
    <>
      <Show when={saved()}>
        <p class="font-semibold text-center text-lg mb-4">Import successful!</p>
        <ButtonLink href="/">Back to diary</ButtonLink>
      </Show>
      <Show when={importError()}>
        <div
          class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
          role="alert"
        >
          <p class="font-bold">Import Error</p>
          <p>{importError()}</p>
        </div>
      </Show>
      <Show when={!parseResult().parsed}>
        <form>
          <fieldset class="flex flex-col">
            <label for="diary-import-file" class="mb-4">
              Select a CSV to import entries from.
            </label>
            <input type="file" name="diary-import-file" onInput={fileChanged} />
            <p class="mt-4">Expected columns are:</p>
            <ul class="list-disc ml-5">
              <li>Consumed At</li>
              <li>Description</li>
              <li>Servings</li>
              <li>Calories</li>
              <li>Total Fat (g)</li>
              <li>Saturated Fat (g)</li>
              <li>Trans Fat (g)</li>
              <li>Polyunsaturated Fat (g)</li>
              <li>Monounsaturated Fat (g)</li>
              <li>Cholesterol (mg)</li>
              <li>Sodium (mg)</li>
              <li>Total Carbohydrate (g)</li>
              <li>Dietary Fiber (g)</li>
              <li>Total Sugars (g)</li>
              <li>Added Sugars (g)</li>
              <li>Protein (g)</li>
            </ul>
          </fieldset>
        </form>
      </Show>
      <Show when={parseResult().parsed && !saved()}>
        <p>
          {parseResult().rights.length} rows parsed.{" "}
          {parseResult().lefts.length} errors.
        </p>
        <table>
          <thead>
            <tr>
              <th></th>
              <th class="text-left">Servings</th>
              <th class="text-left">Calories</th>
            </tr>
          </thead>
          <tbody>
            <Index each={parseResult().rights}>
              {(row: () => NewDiaryEntry) => (
                <>
                  <tr>
                    <td>
                      <p class="font-semibold">
                        {row().nutrition_item.description}
                      </p>
                      <p class="text-xs">
                        {format(
                          parseISO(row().consumed_at),
                          "MMMM d, yyyy pppp",
                        )}
                      </p>
                    </td>
                    <td class="text-right">{row().servings}</td>
                    <td class="text-right">{row().nutrition_item.calories}</td>
                  </tr>
                  <tr>
                    <td colspan="3">
                      <CollapsibleNutritionFacts entry={row()} />
                    </td>
                  </tr>
                </>
              )}
            </Index>
          </tbody>
        </table>
        <button
          disabled={saving()}
          onClick={startImport}
          class="bg-indigo-600 text-slate-50 py-2 px-3 text-lg rounded-md my-4"
        >
          {saving() ? "Importing..." : "Import Entries"}
        </button>
      </Show>
    </>
  );
};

export default ImportDiaryEntries;

const CollapsibleNutritionFacts: Component<{ entry: NewDiaryEntry }> = ({
  entry,
}: {
  entry: NewDiaryEntry;
}) => {
  const [collapsed, setCollapsed] = createSignal(true);
  const toggleCollapsed = (e: Event): void => {
    e.preventDefault();
    setCollapsed(!collapsed());
  };
  return (
    <div class="text-right">
      <button class="text-xs" onClick={toggleCollapsed}>
        {collapsed() ? "View" : "Hide"} Details
      </button>
      <Show when={!collapsed()}>
        <div class="grid grid-cols-6 justify-end text-right">
          <p class="font-semibold col-span-5">Total Fat (g)</p>
          <p>{entry.nutrition_item.totalFatGrams}</p>
          <p class="font-semibold col-span-5">Saturated Fat (g)</p>
          <p>{entry.nutrition_item.saturatedFatGrams}</p>
          <p class="font-semibold col-span-5">Trans Fat (g)</p>
          <p>{entry.nutrition_item.transFatGrams}</p>
          <p class="font-semibold col-span-5">Polyunsaturated Fat (g)</p>
          <p>{entry.nutrition_item.polyunsaturatedFatGrams}</p>
          <p class="font-semibold col-span-5">Monounsaturated Fat (g)</p>
          <p>{entry.nutrition_item.monounsaturatedFatGrams}</p>
          <p class="font-semibold col-span-5">Cholesterol (mg)</p>
          <p>{entry.nutrition_item.cholesterolMilligrams}</p>
          <p class="font-semibold col-span-5">Sodium (mg)</p>
          <p>{entry.nutrition_item.sodiumMilligrams}</p>
          <p class="font-semibold col-span-5">Total Carbohydrate (g)</p>
          <p>{entry.nutrition_item.totalCarbohydrateGrams}</p>
          <p class="font-semibold col-span-5">Dietary Fiber (g)</p>
          <p>{entry.nutrition_item.dietaryFiberGrams}</p>
          <p class="font-semibold col-span-5">Total Sugars (g)</p>
          <p>{entry.nutrition_item.totalSugarsGrams}</p>
          <p class="font-semibold col-span-5">Added Sugars (g)</p>
          <p>{entry.nutrition_item.addedSugarsGrams}</p>
          <p class="font-semibold col-span-5">Protein (g)</p>
          <p>{entry.nutrition_item.proteinGrams}</p>
        </div>
      </Show>
    </div>
  );
};
