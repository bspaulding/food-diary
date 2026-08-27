import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { completeMockLogin } from "../support/login.ts";

/**
 * The single long, stateful journey (specs/2026-08-26-web-e2e-acceptance-test-harness.md
 * §4) seeds every bit of data it needs as it goes and tracks the exact
 * values it typed/received in local variables, so later assertions can
 * compute expected numbers directly instead of guessing at either mock
 * server's internals or re-querying it out of band.
 */

type NutritionFieldKey =
  | "calories"
  | "totalFatGrams"
  | "saturatedFatGrams"
  | "transFatGrams"
  | "polyunsaturatedFatGrams"
  | "monounsaturatedFatGrams"
  | "cholesterolMilligrams"
  | "sodiumMilligrams"
  | "totalCarbohydrateGrams"
  | "dietaryFiberGrams"
  | "totalSugarsGrams"
  | "addedSugarsGrams"
  | "proteinGrams";

const NUTRITION_FIELD_NAMES: Record<NutritionFieldKey, string> = {
  calories: "calories",
  totalFatGrams: "total-fat-grams",
  saturatedFatGrams: "saturated-fat-grams",
  transFatGrams: "trans-fat-grams",
  polyunsaturatedFatGrams: "polyunsaturated-fat-grams",
  monounsaturatedFatGrams: "monounsaturated-fat-grams",
  cholesterolMilligrams: "cholesterol-milligrams",
  sodiumMilligrams: "sodium-milligrams",
  totalCarbohydrateGrams: "total-carbohydrate-grams",
  dietaryFiberGrams: "dietary-fiber-grams",
  totalSugarsGrams: "total-sugars-grams",
  addedSugarsGrams: "added-sugars-grams",
  proteinGrams: "protein-grams",
};

type NutritionFormValues = Partial<Record<NutritionFieldKey, number>> & {
  description?: string;
};

type NutritionFacts = Record<NutritionFieldKey, number>;

async function fillNutritionForm(
  page: Page,
  values: NutritionFormValues,
): Promise<void> {
  if (values.description !== undefined) {
    await page.fill('input[name="description"]', values.description);
  }
  for (const key of Object.keys(NUTRITION_FIELD_NAMES) as NutritionFieldKey[]) {
    const value = values[key];
    if (value !== undefined) {
      await page.fill(
        `input[name="${NUTRITION_FIELD_NAMES[key]}"]`,
        String(value),
      );
    }
  }
}

async function readNutritionFacts(page: Page): Promise<NutritionFacts> {
  const result = {} as NutritionFacts;
  for (const key of Object.keys(NUTRITION_FIELD_NAMES) as NutritionFieldKey[]) {
    const raw = await page.inputValue(
      `input[name="${NUTRITION_FIELD_NAMES[key]}"]`,
    );
    result[key] = parseFloat(raw);
  }
  return result;
}

/** Matches ids at the end of a path, e.g. "/nutrition_item/12" or "/recipe/3". */
function idFromPath(pathname: string): number {
  const match = /(\d+)$/.exec(pathname);
  if (!match) throw new Error(`No id found in path: ${pathname}`);
  return Number(match[1]);
}

async function idFromUrl(page: Page): Promise<number> {
  return idFromPath(new URL(page.url()).pathname);
}

/** Diary entry ids only appear embedded mid-path, in their "Edit" link. */
function diaryEntryIdFromEditHref(href: string): number {
  const match = /\/diary_entry\/(\d+)\/edit/.exec(href);
  if (!match) throw new Error(`No diary entry id found in href: ${href}`);
  return Number(match[1]);
}

async function diaryEntryIdFor(
  page: Page,
  description: string,
): Promise<number> {
  const href = await page
    .locator("li")
    .filter({ hasText: description })
    .getByRole("link", { name: "Edit" })
    .getAttribute("href");
  return diaryEntryIdFromEditHref(href ?? "");
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function editDiaryEntryConsumedAt(
  page: Page,
  entryId: number,
  date: Date,
): Promise<void> {
  await page.goto(`/diary_entry/${entryId}/edit`);
  await page.fill("#consumed_at", toDatetimeLocalValue(date));
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("/");
}

async function editDiaryEntryServings(
  page: Page,
  entryId: number,
  servings: number,
): Promise<void> {
  await page.goto(`/diary_entry/${entryId}/edit`);
  await page.fill("#servings", String(servings));
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("/");
}

test("the full app journey", async ({ page }) => {
  await test.step("cold start, logged out -> auto-redirects to login", async () => {
    // Auth0.ts's resource calls loginWithRedirect() itself as soon as it
    // resolves an unauthenticated session -- there's no stable "logged out"
    // page to land on and click a button from; the real app redirects
    // before a user could click anything. The fallback "Log In" button only
    // exists for the (here, unreachable) case where that redirect fails.
    await page.goto("/");
    await page.waitForURL((url) => url.pathname === "/authorize");
  });

  await test.step("login (real PKCE round trip)", async () => {
    await completeMockLogin(page);
    await expect(page).toHaveURL("/");
    await expect(page.locator("header img")).toBeVisible();
  });

  await test.step("empty diary state", async () => {
    await expect(page.getByText("No entries this week.")).toBeVisible();
  });

  // Tracked as the test goes, so later steps can compute exact expected
  // values instead of asking either mock server what it's holding.
  const banana: NutritionFacts = {
    calories: 105,
    totalFatGrams: 0.4,
    saturatedFatGrams: 0.1,
    transFatGrams: 0,
    polyunsaturatedFatGrams: 0.1,
    monounsaturatedFatGrams: 0,
    cholesterolMilligrams: 0,
    sodiumMilligrams: 1,
    totalCarbohydrateGrams: 27,
    dietaryFiberGrams: 3.1,
    totalSugarsGrams: 14,
    addedSugarsGrams: 0,
    proteinGrams: 1.3,
  };
  let bananaId = 0;

  await test.step("add item flow #1 -- manual entry (Banana)", async () => {
    await page.getByRole("link", { name: "Add Item" }).click();
    await fillNutritionForm(page, { description: "Banana", ...banana });
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/nutrition_item\/\d+$/);
    bananaId = await idFromUrl(page);
    await expect(
      page.locator("h1").filter({ hasNotText: "Food Diary" }),
    ).toHaveText("Banana");
  });

  let bananaEntryId = 0;

  await test.step("search + log flow (log Banana, 2 servings)", async () => {
    await page.goto("/");
    await page.getByRole("link", { name: "Add New Entry" }).click();
    await page.getByText("Search", { exact: true }).click();
    await page.fill('input[name="entry-item-search"]', "Banana");
    await expect(page.getByText(/^\d+ items$/)).toBeVisible();
    const row = page.locator("li").filter({ hasText: "Banana" });
    await row.getByRole("button", { name: "⊕" }).click();
    await row.locator('input[type="number"]').fill("2");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText("✔")).toBeVisible();

    await page.getByRole("link", { name: "Back to Diary" }).click();
    await expect(
      page.getByRole("link", { name: "Banana", exact: true }),
    ).toBeVisible();
    bananaEntryId = await diaryEntryIdFor(page, "Banana");
    await expect(page.getByText(`${2 * banana.calories} kcal`)).toBeVisible();
  });

  await test.step("item detail + edit (Banana calories 105 -> 150)", async () => {
    await page.getByRole("link", { name: "Banana", exact: true }).click();
    await expect(
      page.locator("h1").filter({ hasNotText: "Food Diary" }),
    ).toHaveText("Banana");
    await expect(page.locator("p", { hasText: "Calories" })).toContainText(
      "105",
    );

    await page.getByRole("link", { name: "Edit Item" }).click();
    await page.fill('input[name="calories"]', "150");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(`/nutrition_item/${bananaId}`);
    banana.calories = 150;
    await expect(page.locator("p", { hasText: "Calories" })).toContainText(
      "150",
    );

    await page.getByRole("link", { name: "Back to Diary" }).click();
    await expect(page.getByText(`${2 * banana.calories} kcal`)).toBeVisible();
  });

  const peanutButter: NutritionFacts = {} as NutritionFacts;

  await test.step("add item flow #2 -- AI lookup (Peanut Butter)", async () => {
    await page.goto("/");
    await page.getByRole("link", { name: "Add Item" }).click();
    await page.fill('input[name="description"]', "Peanut Butter");
    await page.getByRole("button", { name: "AI" }).click();
    await expect(page.locator('input[name="calories"]')).not.toHaveValue("0");

    Object.assign(peanutButter, await readNutritionFacts(page));

    // Adjust one field by hand after the AI-populated values land, per the
    // outline -- proves the form fields stay editable post-import.
    await page.fill('input[name="total-fat-grams"]', "99");
    peanutButter.totalFatGrams = 99;

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/nutrition_item\/\d+$/);
    await expect(
      page.locator("h1").filter({ hasNotText: "Food Diary" }),
    ).toHaveText("Peanut Butter");
    await expect(page.locator("p", { hasText: "Total Fat (g)" })).toContainText(
      "99",
    );
  });

  const scannedItem: NutritionFacts = {
    calories: 210,
    totalFatGrams: 8,
    saturatedFatGrams: 3,
    transFatGrams: 0,
    polyunsaturatedFatGrams: 1,
    monounsaturatedFatGrams: 2,
    cholesterolMilligrams: 15,
    sodiumMilligrams: 340,
    totalCarbohydrateGrams: 27,
    dietaryFiberGrams: 3,
    totalSugarsGrams: 9,
    addedSugarsGrams: 4,
    proteinGrams: 6,
  };
  await test.step("add item flow #3 -- camera scan", async () => {
    await page.goto("/nutrition_item/new");
    await page.getByRole("button", { name: "Scan" }).click();
    await page.getByRole("button", { name: "Upload Image" }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(join(__dirname, "..", "fixtures", "nutrition-label.jpg"));
    const importButton = page.getByRole("button", { name: "Import Label" });
    await expect(importButton).toBeEnabled();
    await importButton.click();

    await expect(page.getByText("Scan Nutrition Label")).toBeHidden();
    await expect(page.locator('input[name="description"]')).toHaveValue(
      "Mock Scanned Nutrition Label",
    );
    const facts = await readNutritionFacts(page);
    expect(facts).toEqual(scannedItem);

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/nutrition_item\/\d+$/);
    await expect(
      page.locator("h1").filter({ hasNotText: "Food Diary" }),
    ).toHaveText("Mock Scanned Nutrition Label");
  });

  let recipeId = 0;
  let recipeTotalServings = 2;
  let recipeTotalCalories = 0;

  await test.step("create a recipe (PB Mix Recipe: Banana + Peanut Butter)", async () => {
    await page.goto("/recipe/new");
    await page.fill('input[name="name"]', "PB Mix Recipe");
    await page.fill(
      'input[name="total-servings"]',
      String(recipeTotalServings),
    );

    const addItemsFieldset = page
      .locator("fieldset")
      .filter({ has: page.locator("legend", { hasText: "Add New Items" }) });

    await addItemsFieldset
      .locator('input[name="entry-item-search"]')
      .fill("Banana");
    await addItemsFieldset
      .locator("li")
      .filter({ hasText: "Banana" })
      .getByRole("button", { name: "⊕" })
      .click();

    await addItemsFieldset
      .locator('input[name="entry-item-search"]')
      .fill("Peanut Butter");
    await addItemsFieldset
      .locator("li")
      .filter({ hasText: "Peanut Butter" })
      .getByRole("button", { name: "⊕" })
      .click();

    const itemsFieldset = page
      .locator("fieldset")
      .filter({ has: page.locator("legend", { hasText: /^Items$/ }) });
    await expect(itemsFieldset.getByText("2 items in recipe.")).toBeVisible();

    recipeTotalCalories = banana.calories + peanutButter.calories;

    await page.getByRole("button", { name: "Save Recipe" }).click();
    await page.waitForURL(/\/recipe\/\d+$/);
    recipeId = await idFromUrl(page);
    await expect(
      page.locator("h1").filter({ hasNotText: "Food Diary" }),
    ).toHaveText("PB Mix Recipe");
  });

  const recipeEntryServings = 3;

  await test.step("log the recipe", async () => {
    await page.getByRole("link", { name: "Back to Diary" }).click();
    await page.getByRole("link", { name: "Add New Entry" }).click();
    await page.getByText("Search", { exact: true }).click();
    await page.fill('input[name="entry-item-search"]', "PB Mix Recipe");
    const row = page.locator("li").filter({ hasText: "PB Mix Recipe" });
    await expect(row.getByText("RECIPE", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "⊕" }).click();
    await row.locator('input[type="number"]').fill(String(recipeEntryServings));
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText("✔")).toBeVisible();

    await page.getByRole("link", { name: "Back to Diary" }).click();
    await expect(
      page.getByRole("link", { name: "PB Mix Recipe", exact: true }),
    ).toBeVisible();

    const caloriesPerServing = recipeTotalCalories / recipeTotalServings;
    const expectedCalories = Math.round(
      recipeEntryServings * caloriesPerServing,
    );
    await expect(page.getByText(`${expectedCalories} kcal`)).toBeVisible();
  });

  await test.step("recipe detail + edit (add scanned item, total servings 2 -> 4)", async () => {
    await page
      .locator("li")
      .filter({ hasText: "PB Mix Recipe" })
      .getByRole("link", { name: "PB Mix Recipe" })
      .click();
    await page.waitForURL(`/recipe/${recipeId}`);

    let caloriesPerServing = recipeTotalCalories / recipeTotalServings;
    await expect(
      page.getByText(`Total Calories: ${Math.round(recipeTotalCalories)} kcal`),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Calories per Serving: ${Math.round(caloriesPerServing)} kcal`,
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Banana" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Peanut Butter" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Edit Recipe" }).click();
    recipeTotalServings = 4;
    await page.fill(
      'input[name="total-servings"]',
      String(recipeTotalServings),
    );

    const addItemsFieldset = page
      .locator("fieldset")
      .filter({ has: page.locator("legend", { hasText: "Add New Items" }) });
    await addItemsFieldset
      .locator('input[name="entry-item-search"]')
      .fill("Mock Scanned");
    await addItemsFieldset
      .locator("li")
      .filter({ hasText: "Mock Scanned Nutrition Label" })
      .getByRole("button", { name: "⊕" })
      .click();

    recipeTotalCalories =
      banana.calories + peanutButter.calories + scannedItem.calories;

    await page.getByRole("button", { name: "Save Recipe" }).click();
    await page.waitForURL(`/recipe/${recipeId}`);

    caloriesPerServing = recipeTotalCalories / recipeTotalServings;
    await expect(
      page.getByText(`Total Calories: ${Math.round(recipeTotalCalories)} kcal`),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Calories per Serving: ${Math.round(caloriesPerServing)} kcal`,
      ),
    ).toBeVisible();

    await page.getByRole("link", { name: "Back to Diary" }).click();
    const expectedCalories = Math.round(
      recipeEntryServings * caloriesPerServing,
    );
    await expect(page.getByText(`${expectedCalories} kcal`)).toBeVisible();
  });

  await test.step("edit a diary entry (Banana: 2 -> 5 servings)", async () => {
    await editDiaryEntryServings(page, bananaEntryId, 5);
    await expect(page.getByText(`${5 * banana.calories} kcal`)).toBeVisible();
    await expect(page.getByText("5 servings")).toBeVisible();
  });

  await test.step("weekly stats + week navigation", async () => {
    // Diary entries land on the diary list's "this week" page purely by
    // real wall-clock time (no clock override), but the weekly-stats
    // aggregate intentionally excludes *today* (see DiaryList.tsx's
    // todayStart upper bound), so a non-zero "Last 7 Days"/"4 Week Avg"
    // needs a real consumed_at from a prior day, not just "now".
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    await editDiaryEntryConsumedAt(page, bananaEntryId, yesterday);

    const bananaCalories = 5 * banana.calories;
    await expect(
      page.getByText(`${Math.ceil(bananaCalories / 7)} kcal/day`),
    ).toBeVisible();
    await expect(
      page.getByText(`${Math.ceil(bananaCalories / 28)} kcal/day`),
    ).toBeVisible();

    // Push it further back, out of both the stats window and the diary
    // list's current-page window, into "last week" (page 1).
    const eightDaysAgo = new Date(now);
    eightDaysAgo.setDate(now.getDate() - 8);
    await editDiaryEntryConsumedAt(page, bananaEntryId, eightDaysAgo);

    await expect(page.getByText("0 kcal/day")).toBeVisible();
    await expect(
      page.getByText(`${Math.ceil(bananaCalories / 28)} kcal/day`),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Banana", exact: true }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "← Previous Week" }).click();
    await expect(
      page.getByRole("link", { name: "Banana", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Next Week →" }).click();
    await expect(
      page.getByRole("link", { name: "Banana", exact: true }),
    ).toHaveCount(0);
  });

  await test.step("most-logged + time-based suggestions", async () => {
    await page.getByRole("link", { name: "Add New Entry" }).click();
    await expect(
      page.getByRole("heading", { name: "Logged at this time of day" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recently logged" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Most logged" }),
    ).toBeVisible();
    // Both the Banana and PB Mix Recipe entries were logged within the last
    // few minutes of real test execution, at the same hour "now" falls in,
    // so they show up in every suggestions bucket.
    await expect(
      page.getByText("PB Mix Recipe", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Banana", { exact: true }).first(),
    ).toBeVisible();
  });

  await test.step("trends page", async () => {
    await page.goto("/trends");
    await expect(
      page.getByText("No data available yet. Add some diary entries"),
    ).toBeHidden();
    await expect(
      page.getByText("Average Daily Calories (per week)"),
    ).toBeVisible();
  });

  await test.step("delete a diary entry (Banana, now in the previous week)", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "← Previous Week" }).click();
    // DiaryList nests one <li> per entry inside an outer per-day <li> that
    // also "contains" the same text, so a plain hasText filter on "li"
    // matches both, in document order (outer first) -- .last() picks the
    // more specific, innermost entry row.
    const row = page.locator("li").filter({ hasText: "Banana" }).last();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(
      page.getByRole("link", { name: "Banana", exact: true }),
    ).toHaveCount(0);
  });

  await test.step("nutrition targets persist across reload", async () => {
    await page.goto("/profile");
    await page.getByLabel("Calorie min (kcal)").fill("1800");
    await page.getByLabel("Calorie max (kcal)").fill("2600");
    await page.getByLabel("Protein (g)").fill("120");
    await page.getByLabel("Dietary Fiber (g)").fill("30");
    await page.getByLabel("Added Sugar (g)").fill("40");
    await page.getByRole("button", { name: "Save Targets" }).click();
    await expect(page.getByRole("button", { name: "Saved!" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Calorie min (kcal)")).toHaveValue("1800");
    await expect(page.getByLabel("Calorie max (kcal)")).toHaveValue("2600");
    await expect(page.getByLabel("Protein (g)")).toHaveValue("120");
    await expect(page.getByLabel("Dietary Fiber (g)")).toHaveValue("30");
    await expect(page.getByLabel("Added Sugar (g)")).toHaveValue("40");
  });

  await test.step("CSV export", async () => {
    await page.getByRole("link", { name: "Export Entries" }).click();
    await page.getByLabel("All dates").check();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export As CSV" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Export did not produce a file");
    const csv = readFileSync(downloadPath, "utf-8");

    expect(csv).toContain(
      `PB Mix Recipe - Banana",${recipeEntryServings},${banana.calories}`,
    );
    expect(csv).toContain(
      `PB Mix Recipe - Peanut Butter",${recipeEntryServings},${peanutButter.calories}`,
    );
    expect(csv).toContain(
      `PB Mix Recipe - Mock Scanned Nutrition Label",${recipeEntryServings},${scannedItem.calories}`,
    );
  });

  await test.step("CSV import", async () => {
    await page.getByRole("link", { name: "Back to profile" }).click();
    await page.getByRole("link", { name: "Import Entries" }).click();

    // A static fixture with a fixed date would eventually fall outside the
    // diary list's rolling "this week" window it's asserted against below,
    // so the date is computed relative to the real clock instead, same as
    // every other diary entry in this test.
    const importedAt = new Date();
    importedAt.setDate(importedAt.getDate() - 2);
    const header =
      "Consumed At,Servings,Description,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)";
    const row = `${importedAt.toISOString()},1,CSV Imported Oatmeal,150,3,0.5,0,1,1,0,2,27,4,1,0,5`;
    await page.locator('input[name="diary-import-file"]').setInputFiles({
      name: "import-entries.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`${header}\n${row}\n`, "utf-8"),
    });

    await expect(page.getByText("1 rows parsed. 0 errors.")).toBeVisible();
    await page.getByRole("button", { name: "Import Entries" }).click();
    await expect(page.getByText("Import successful!")).toBeVisible();

    await page.getByRole("link", { name: "Back to diary" }).click();
    // .last(): see the "delete a diary entry" step's note on DiaryList's
    // nested per-day/per-entry <li> structure.
    const oatmealRow = page
      .locator("li")
      .filter({ hasText: "CSV Imported Oatmeal" })
      .last();
    await expect(oatmealRow).toBeVisible();
    await expect(oatmealRow.getByText("150 kcal")).toBeVisible();
  });

  await test.step("session expiry / 401 handling", async () => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Logout" }).click();
    await page.waitForURL((url) => url.pathname === "/authorize");

    // auth0-spa-js's own getTokenSilently() treats a cached token as stale
    // (and immediately tries a silent-auth refresh, which this mock can't
    // satisfy) whenever it has under 60s of remaining life -- confirmed
    // against its source, `_getEntryFromCache` hardcodes a 60s leeway. A
    // ttl below that would make login itself hang, not just expire later,
    // so 75s here is the shortest usable value, comfortably past that
    // margin. The app only ever calls getTokenSilently() once per mount,
    // caching the result in a plain signal, so the real expiry this step
    // exercises happens later purely from the JWT's own exp claim on the
    // next API call -- unrelated to that cache-freshness heuristic.
    await completeMockLogin(page, { ttlSeconds: 75 });
    await expect(page).toHaveURL("/");
    await expect(page.locator("header img")).toBeVisible();

    // Let the token genuinely expire, then reuse the diary list's
    // *already-mounted* resource (a pagination click, not a fresh page
    // load) so the stale token is what actually goes over the wire -- a
    // full navigation would mint a fresh Auth0Client that calls
    // getTokenSilently() again, hitting the same 60s-leeway silent-renewal
    // attempt instead of the API's real 401 path this step is after.
    await page.waitForTimeout(77_000);
    await page.getByRole("button", { name: "← Previous Week" }).click();
    await page.waitForURL((url) => url.pathname === "/authorize", {
      timeout: 15_000,
    });
  });

  await test.step("logout via profile button (manual path)", async () => {
    await completeMockLogin(page);
    await expect(page).toHaveURL("/");
    await page.goto("/profile");
    await page.getByRole("button", { name: "Logout" }).click();
    await page.waitForURL((url) => url.pathname === "/authorize");
  });

  await test.step("re-login, data persists", async () => {
    await completeMockLogin(page);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("link", { name: "PB Mix Recipe", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "CSV Imported Oatmeal" }),
    ).toBeVisible();
  });
});
