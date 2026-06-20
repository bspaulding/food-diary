const host = "/api/v1/graphql";

/**
 * Custom error class for authorization failures (401/403 responses)
 */
export class AuthorizationError extends Error {
  constructor(message: string = "Authorization failed") {
    super(message);
    this.name = "AuthorizationError";
  }
}

type LogoutHandler = () => void;
let logoutHandler: LogoutHandler | undefined;

/**
 * Register a callback to invoke whenever any API call receives a 401/403.
 * Call this once at app startup (e.g. in App.tsx) with the Auth0 logout function.
 * Pass `undefined` to clear the handler (useful in tests).
 */
export function registerLogoutHandler(
  handler: LogoutHandler | undefined,
): void {
  logoutHandler = handler;
}

/**
 * Type for GraphQL error objects in the response
 */
interface GraphQLErrorObject {
  message: string;
  [key: string]: unknown;
}

/**
 * Type for GraphQL response body
 */
interface GraphQLResponse {
  data?: unknown;
  errors?: GraphQLErrorObject[];
}

/**
 * Custom error class for GraphQL errors
 */
export class GraphQLError extends Error {
  constructor(
    message: string,
    public errors: GraphQLErrorObject[],
  ) {
    super(message);
    this.name = "GraphQLError";
  }
}

const macrosFragment = `
fragment Macros on food_diary_nutrition_item {
  added_sugars_grams
	protein_grams
	dietary_fiber_grams
}
`;

const diaryEntryFields = `
        id
        consumed_at
        calories
        servings
        nutrition_item { id, description, calories, ...Macros }
        recipe { id, name, calories, total_servings, recipe_items { servings, nutrition_item { ...Macros } } }`;

const getEntriesQuery = `
${macrosFragment}
query GetEntries {
    food_diary_diary_entry(order_by: { day: desc, consumed_at: asc }) {${diaryEntryFields}
    }
}
`;

const getEntriesFromDateQuery = `
${macrosFragment}
query GetEntries($startDate: timestamptz!) {
    food_diary_diary_entry(
        where: { consumed_at: { _gte: $startDate } }
        order_by: { day: desc, consumed_at: asc }
    ) {${diaryEntryFields}
    }
}
`;

const getEntriesDateRangeQuery = `
${macrosFragment}
query GetEntries($startDate: timestamptz!, $endDate: timestamptz!) {
    food_diary_diary_entry(
        where: { consumed_at: { _gte: $startDate, _lt: $endDate } }
        order_by: { day: desc, consumed_at: asc }
    ) {${diaryEntryFields}
    }
}
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchQuery<T = any>(
  accessToken: string,
  query: string,
  variables: object = {},
): Promise<T> {
  const response = await fetch(`${host}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  // Check for authorization errors (401 Unauthorized or 403 Forbidden)
  if (response.status === 401 || response.status === 403) {
    logoutHandler?.();
    throw new AuthorizationError("Authorization failed");
  }

  // Check for other HTTP errors
  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  // Check for GraphQL errors in the response body
  const json: GraphQLResponse = await response.json();
  if (json.errors) {
    const errorMessage: string = json.errors
      .map((e: GraphQLErrorObject) => e.message)
      .join(", ");
    throw new GraphQLError(errorMessage, json.errors);
  }

  return json as T;
}

// Macro nutrient keys that can be accessed on nutrition items
export type MacroKey =
  | "calories"
  | "added_sugars_grams"
  | "protein_grams"
  | "total_fat_grams"
  | "saturated_fat_grams"
  | "trans_fat_grams"
  | "polyunsaturated_fat_grams"
  | "monounsaturated_fat_grams"
  | "cholesterol_milligrams"
  | "sodium_milligrams"
  | "total_carbohydrate_grams"
  | "dietary_fiber_grams"
  | "total_sugars_grams";

// Nutrition item with all macro fields
export type NutritionItemWithMacros = {
  id: number;
  description: string;
  calories: number;
  added_sugars_grams: number;
  protein_grams: number;
  total_fat_grams: number;
  saturated_fat_grams: number;
  trans_fat_grams: number;
  polyunsaturated_fat_grams: number;
  monounsaturated_fat_grams: number;
  cholesterol_milligrams: number;
  sodium_milligrams: number;
  total_carbohydrate_grams: number;
  dietary_fiber_grams: number;
  total_sugars_grams: number;
};

// Recipe item that's part of a recipe
export type RecipeItem = {
  id: number;
  servings: number;
  nutrition_item: NutritionItemWithMacros;
};

// Recipe with items
export type RecipeWithItems = {
  id: number;
  name: string;
  calories: number;
  total_servings: number;
  recipe_items: RecipeItem[];
};

export type DiaryEntry = {
  id: number;
  day: string;
  consumed_at: string;
  servings: number;
  calories: number;
  nutrition_item?: NutritionItemWithMacros;
  recipe?: RecipeWithItems;
};

export type GetEntriesQueryResponse = {
  data: {
    food_diary_diary_entry: DiaryEntry[];
  };
};

export async function fetchEntries(
  accessToken: string,
  startDate?: string,
  endDate?: string,
): Promise<GetEntriesQueryResponse> {
  if (startDate && endDate) {
    return await fetchQuery(accessToken, getEntriesDateRangeQuery, {
      startDate,
      endDate,
    });
  }
  if (startDate) {
    return await fetchQuery(accessToken, getEntriesFromDateQuery, {
      startDate,
    });
  }
  return await fetchQuery(accessToken, getEntriesQuery);
}

const getWeeklyStatsQuery = `
query GetWeeklyStats($currentWeekStart: timestamptz!, $todayStart: timestamptz!, $fourWeeksAgoStart: timestamptz!) {
  current_week: food_diary_diary_entry_aggregate(
    where: { consumed_at: { _gte: $currentWeekStart, _lt: $todayStart } }
  ) {
    aggregate {
      sum {
        calories
      }
    }
  }
  past_four_weeks: food_diary_diary_entry_aggregate(
    where: { 
      consumed_at: { _gte: $fourWeeksAgoStart, _lt: $todayStart }
    }
  ) {
    aggregate {
      sum {
        calories
      }
    }
  }
}
`;

export type WeeklyStatsResponse = {
  data: {
    current_week: {
      aggregate: {
        sum: {
          calories: number | null;
        };
      };
    };
    past_four_weeks: {
      aggregate: {
        sum: {
          calories: number | null;
        };
      };
    };
  };
};

export async function fetchWeeklyStats(
  accessToken: string,
  currentWeekStart: string,
  todayStart: string,
  fourWeeksAgoStart: string,
): Promise<WeeklyStatsResponse> {
  return await fetchQuery(accessToken, getWeeklyStatsQuery, {
    currentWeekStart,
    todayStart,
    fourWeeksAgoStart,
  });
}

const searchItemsAndRecipesQuery = `
query SearchItemsAndRecipes($search: String!) {
  food_diary_search_nutrition_items(args: { search: $search }) {
    id,
    description
  }

  food_diary_search_recipes(args: { search: $search }) {
    id,
    name
  }
}
`;

// Search result types
export type SearchNutritionItem = {
  id: number;
  description: string;
};

export type SearchRecipe = {
  id: number;
  name: string;
};

export type SearchItemsAndRecipesQueryResponse = {
  data?: {
    food_diary_search_nutrition_items: SearchNutritionItem[];
    food_diary_search_recipes: SearchRecipe[];
  };
};

export async function searchItemsAndRecipes(
  accessToken: string,
  search: string,
): Promise<SearchItemsAndRecipesQueryResponse> {
  return await fetchQuery(accessToken, searchItemsAndRecipesQuery, {
    search,
  });
}

const searchItemsOnlyQuery = `
query SearchItems($search: String!) {
  food_diary_search_nutrition_items(args: { search: $search }) {
    id,
    description
  }
}
`;

export type SearchItemsOnlyQueryResponse = {
  data?: {
    food_diary_search_nutrition_items: SearchNutritionItem[];
    food_diary_search_recipes?: SearchRecipe[];
  };
};

export async function searchItemsOnly(
  accessToken: string,
  search: string,
): Promise<SearchItemsOnlyQueryResponse> {
  return await fetchQuery(accessToken, searchItemsOnlyQuery, {
    search,
  });
}

const createNutritionItemMutation = `
mutation CreateNutritionItem($nutritionItem: food_diary_nutrition_item_insert_input!) {
	insert_food_diary_nutrition_item_one(object: $nutritionItem) {
    id
  }
}
`;

export type NutritionItemAttrs = {
  description: string;
  calories: number;
  totalFatGrams: number;
  saturatedFatGrams: number;
  transFatGrams: number;
  polyunsaturatedFatGrams: number;
  monounsaturatedFatGrams: number;
  cholesterolMilligrams: number;
  sodiumMilligrams: number;
  totalCarbohydrateGrams: number;
  dietaryFiberGrams: number;
  totalSugarsGrams: number;
  addedSugarsGrams: number;
  proteinGrams: number;
};

export type NutritionItem = NutritionItemAttrs & {
  id: number;
};

export async function createNutritionItem(
  accessToken: string,
  item: NutritionItem,
) {
  // Exclude id field when creating a new item
  const { id: _id, ...itemWithoutId } = item;
  return await fetchQuery(accessToken, createNutritionItemMutation, {
    nutritionItem: objectToSnakeCaseKeys(itemWithoutId),
  });
}

const updateNutritionItemMutation = `
mutation UpdateItem($id: Int!, $attrs: food_diary_nutrition_item_set_input!) {
  update_food_diary_nutrition_item_by_pk(pk_columns: {id: $id }, _set: $attrs) {
    id
  }
}
`;

export async function updateNutritionItem(
  accessToken: string,
  item: NutritionItem,
) {
  return await fetchQuery(accessToken, updateNutritionItemMutation, {
    id: item.id,
    attrs: objectToSnakeCaseKeys(item),
  });
}

function isUppercase(s: string): boolean {
  return s === s.toUpperCase();
}

function camelToSnakeCase(s: string): string {
  return Array.from(s).reduce(
    (acc, c) => acc + (isUppercase(c) ? "_" + c.toLowerCase() : c),
    "",
  );
}

function objectToSnakeCaseKeys(o: object): object {
  return Object.entries(o).reduce(
    (acc: object, [k, v]: [string, unknown]) => ({
      ...acc,
      [camelToSnakeCase(k)]: v,
    }),
    {},
  );
}

const getNutritionItemQuery = `
query GetNutritionItem($id: Int!) {
  food_diary_nutrition_item_by_pk(id: $id) {
    id,
    description
    calories
    totalFatGrams: total_fat_grams,
    saturatedFatGrams: saturated_fat_grams,
    transFatGrams: trans_fat_grams,
    polyunsaturatedFatGrams: polyunsaturated_fat_grams
    monounsaturatedFatGrams: monounsaturated_fat_grams
    cholesterolMilligrams: cholesterol_milligrams
    sodiumMilligrams: sodium_milligrams,
    totalCarbohydrateGrams: total_carbohydrate_grams
    dietaryFiberGrams: dietary_fiber_grams
    totalSugarsGrams: total_sugars_grams
    addedSugarsGrams: added_sugars_grams
    proteinGrams: protein_grams
  }
}
`;
export type GetNutritionItemQueryResponse = {
  data?: {
    food_diary_nutrition_item_by_pk?: NutritionItem;
  };
};

export async function fetchNutritionItem(
  accessToken: string,
  id: number | string,
): Promise<GetNutritionItemQueryResponse> {
  return await fetchQuery(accessToken, getNutritionItemQuery, { id });
}

const getRecentEntriesQuery = `
query GetRecentEntryItems {
  food_diary_diary_entry_recent(order_by: {consumed_at:desc}, limit: 5) {
    consumed_at
  	nutrition_item { id, description }
    recipe { id, name }
  }
}
`;

export async function fetchRecentEntries(accessToken: string) {
  return await fetchQuery(accessToken, getRecentEntriesQuery);
}

const getTopEntriesAroundHourQuery = `
query TopEntriesAroundHour($startHour: Int!, $endHour: Int!) {
  food_diary_top_entries_around_hour(
    args: { start_hour: $startHour, end_hour: $endHour, n: 5 }
  ) {
    consumed_at
    nutrition_item { id, description }
    recipe { id, name }
  }
}
`;

export async function fetchTopEntriesAroundHour(
  accessToken: string,
  startHour: number,
  endHour: number,
) {
  return await fetchQuery(accessToken, getTopEntriesAroundHourQuery, {
    startHour,
    endHour,
  });
}

const getTopLoggedItemsQuery = `
query GetTopLoggedItems {
  food_diary_diary_entry(
    order_by: {consumed_at: desc}
    limit: 100
  ) {
    consumed_at
    nutrition_item { id, description }
    recipe { id, name }
  }
}
`;

export async function fetchTopLoggedItems(accessToken: string) {
  return await fetchQuery(accessToken, getTopLoggedItemsQuery);
}

const createDiaryEntryQuery = `
mutation CreateDiaryEntry($entry: food_diary_diary_entry_insert_input!) {
  insert_food_diary_diary_entry_one(object: $entry) {
    id
  }
}`;

export type CreateDiaryEntryInput =
  | CreateDiaryEntryRecipeInput
  | CreateDiaryEntryItemInput;

export type CreateDiaryEntryItemInput = {
  servings: number;
  nutrition_item_id: number;
};

export type CreateDiaryEntryRecipeInput = {
  servings: number;
  recipe_id: number;
};

export async function createDiaryEntry(
  accessToken: string,
  entry: CreateDiaryEntryInput,
) {
  return await fetchQuery(accessToken, createDiaryEntryQuery, { entry });
}

const deleteDiaryEntryQuery = `
mutation DeleteEntry($id: Int!) {
  delete_food_diary_diary_entry_by_pk(id: $id) {
    id
  }
}`;

export async function deleteDiaryEntry(accessToken: string, id: number) {
  return await fetchQuery(accessToken, deleteDiaryEntryQuery, { id });
}

export type RecipeAttrs = {
  name: string;
  total_servings: number;
  recipe_items: InsertRecipeItemInput[];
};

export type Recipe = RecipeAttrs & {
  id: number;
};

export type InsertRecipeItemInput = InsertRecipeItemExistingItem;
// TODO: Support nested new item creation
// | InsertRecipeItemNewItem;

export type InsertRecipeItemExistingItem = {
  servings: number;
  nutrition_item: { id: number; description: string };
};

export type InsertRecipeItemNewItem = {
  servings: number;
  nutrition_item: NutritionItemAttrs;
};

const createRecipeMutation = `
mutation CreateRecipe($input: food_diary_recipe_insert_input!) {
  insert_food_diary_recipe_one(object: $input) {
    id
  }
}
`;

function transformRecipeInput(formInput: RecipeAttrs) {
  return {
    ...formInput,
    recipe_items: {
      data: formInput.recipe_items.map((item) => ({
        servings: item.servings,
        nutrition_item_id: item.nutrition_item.id,
      })),
    },
  };
}

export async function createRecipe(
  accessToken: string,
  formInput: RecipeAttrs,
) {
  return await fetchQuery(accessToken, createRecipeMutation, {
    input: transformRecipeInput(formInput),
  });
}

const updateRecipeMutation = `
mutation UpdateRecipe($id: Int!, $attrs: food_diary_recipe_set_input!, $items: [food_diary_recipe_item_insert_input!]!) {
  update_food_diary_recipe_by_pk(pk_columns: {id: $id }, _set: $attrs) {
    id
  }
  delete_food_diary_recipe_item(where: { recipe_id: { _eq: $id } }) {
    affected_rows
  }
  insert_food_diary_recipe_item(objects: $items) {
    affected_rows
  }
}
`;

export async function updateRecipe(accessToken: string, recipe: Recipe) {
  const { id, ...attrs } = recipe;
  const { recipe_items, ...recipeAttrs } = transformRecipeInput(attrs);
  const recipeItemsInput = recipe_items.data.map((item) => ({
    ...item,
    recipe_id: id,
  }));
  return await fetchQuery(accessToken, updateRecipeMutation, {
    id,
    attrs: recipeAttrs,
    items: recipeItemsInput,
  });
}

const fetchRecipeQuery = `
query GetRecipe($id: Int!) {
  food_diary_recipe_by_pk(id: $id) {
    id,
    name,
    total_servings,
    recipe_items {
      servings
      nutrition_item {
        id,
        description,
        calories
      }
    }
  }
}
`;

export type GetRecipeQueryResponse = {
  data?: {
    food_diary_recipe_by_pk?: {
      id: number;
      name: string;
      total_servings: number;
      recipe_items: RecipeItem[];
    };
  };
};

export async function fetchRecipe(
  accessToken: string,
  id: number,
): Promise<GetRecipeQueryResponse> {
  return await fetchQuery(accessToken, fetchRecipeQuery, { id });
}

export type NewDiaryEntry = {
  consumed_at: string;
  servings: number;
  nutrition_item: NutritionItemAttrs;
};

const insertDiaryEntriesWithItemsMutation = `
mutation InsertDiaryEntriesWithNewItems($entries: [food_diary_diary_entry_insert_input!]!){
  insert_food_diary_diary_entry(objects: $entries) {
    affected_rows
  }
}
`;

export async function insertDiaryEntries(
  accessToken: string,
  entries: NewDiaryEntry[],
) {
  return await fetchQuery(accessToken, insertDiaryEntriesWithItemsMutation, {
    entries: entries.map((entry) => ({
      ...entry,
      nutrition_item: {
        data: objectToSnakeCaseKeys(entry.nutrition_item),
      },
    })),
  });
}

const nutritionItemFragment = `
fragment nutritionItem on food_diary_nutrition_item {
  description
  calories
  total_fat_grams
  saturated_fat_grams
  trans_fat_grams
  polyunsaturated_fat_grams
  monounsaturated_fat_grams
  cholesterol_milligrams
  sodium_milligrams
  total_carbohydrate_grams
  dietary_fiber_grams
  total_sugars_grams
  added_sugars_grams
  protein_grams
}`;

const entryFields = `
    servings
    consumed_at
    nutrition_item {
      ...nutritionItem
    }
    recipe {
      name
      recipe_items {
        servings
        nutrition_item {
          ...nutritionItem
        }
      }
    }`;

const exportEntriesQuery = `
${nutritionItemFragment}

query ExportEntries {
  food_diary_diary_entry {
    ${entryFields}
  }
}`;

const exportEntriesWithDateRangeQuery = `
${nutritionItemFragment}

query ExportEntriesWithDateRange($startDate: timestamptz!, $endDate: timestamptz!) {
  food_diary_diary_entry(where: { consumed_at: { _gte: $startDate, _lte: $endDate } }) {
    ${entryFields}
  }
}`;

export async function fetchExportEntries(
  accessToken: string,
  startDate?: string,
  endDate?: string,
) {
  if (startDate && endDate) {
    return await fetchQuery(accessToken, exportEntriesWithDateRangeQuery, {
      startDate,
      endDate,
    });
  }
  return await fetchQuery(accessToken, exportEntriesQuery);
}

const getDiaryEntryQuery = `
  fragment Macros on food_diary_nutrition_item {
    total_fat_grams
    added_sugars_grams
    protein_grams
  }

  query GetDiaryEntry($id: Int!) {
    food_diary_diary_entry_by_pk(id: $id) {
      id
      consumed_at
      calories
      servings
      nutrition_item { id, description, calories, ...Macros }
      recipe { id, name, calories, total_servings, recipe_items { servings, nutrition_item { ...Macros } } }
    }
  }
`;
export async function getDiaryEntry(accessToken: string, id: number | string) {
  return await fetchQuery(accessToken, getDiaryEntryQuery, { id });
}

const updateDiaryEntryMutation = `
mutation UpdateDiaryEntry($id: Int!, $attrs: food_diary_diary_entry_set_input!) {
  update_food_diary_diary_entry_by_pk(pk_columns: {id: $id }, _set: $attrs) {
    id
  }
}
`;

export async function updateDiaryEntry(
  accessToken: string,
  entry: { id: number; servings: number; consumedAt: string },
) {
  return fetchQuery(accessToken, updateDiaryEntryMutation, {
    id: entry.id,
    attrs: objectToSnakeCaseKeys(entry),
  });
}

// Weekly trends query - uses backend view for pre-aggregated data
const getWeeklyTrendsQuery = `
query GetWeeklyTrends {
  food_diary_trends_weekly {
    week_of_year
    protein
    calories
    added_sugar
  }
}
`;

export type WeeklyTrendsData = {
  week_of_year: string;
  protein: number;
  calories: number;
  added_sugar: number;
};

export type GetWeeklyTrendsResponse = {
  data: {
    food_diary_trends_weekly: WeeklyTrendsData[];
  };
};

export async function fetchWeeklyTrends(
  accessToken: string,
): Promise<GetWeeklyTrendsResponse> {
  return await fetchQuery(accessToken, getWeeklyTrendsQuery);
}

const getNutritionTargetsQuery = `
query GetNutritionTargets {
  food_diary_nutrition_target {
    calories
    calories_max
    protein_grams
    dietary_fiber_grams
    added_sugars_grams
  }
}
`;

export type NutritionTargetsRow = {
  calories: number;
  calories_max: number;
  protein_grams: number;
  dietary_fiber_grams: number;
  added_sugars_grams: number;
};

export type GetNutritionTargetsQueryResponse = {
  data?: {
    food_diary_nutrition_target: NutritionTargetsRow[];
  };
};

export async function fetchNutritionTargets(
  accessToken: string,
): Promise<GetNutritionTargetsQueryResponse> {
  return await fetchQuery(accessToken, getNutritionTargetsQuery);
}

const setNutritionTargetsMutation = `
mutation SetNutritionTargets($target: food_diary_nutrition_target_insert_input!) {
  insert_food_diary_nutrition_target_one(
    object: $target
    on_conflict: {
      constraint: nutrition_target_pkey
      update_columns: [calories, calories_max, protein_grams, dietary_fiber_grams, added_sugars_grams]
    }
  ) {
    user_id
  }
}
`;

export async function setNutritionTargets(
  accessToken: string,
  target: NutritionTargetsRow,
): Promise<unknown> {
  return await fetchQuery(accessToken, setNutritionTargetsMutation, {
    target,
  });
}

export async function lookupNutritionWithLLM(
  description: string,
): Promise<Partial<NutritionItemAttrs>> {
  const response = await fetch("/llm/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error) message = body.error;
    } catch {
      // fall back to statusText
    }
    throw new Error(message);
  }
  const { item } = (await response.json()) as {
    item: Record<string, unknown>;
  };
  return {
    description: typeof item.description === "string" ? item.description : "",
    calories: typeof item.calories === "number" ? item.calories : 0,
    totalFatGrams:
      typeof item.total_fat_grams === "number" ? item.total_fat_grams : 0,
    saturatedFatGrams:
      typeof item.saturated_fat_grams === "number"
        ? item.saturated_fat_grams
        : 0,
    transFatGrams:
      typeof item.trans_fat_grams === "number" ? item.trans_fat_grams : 0,
    polyunsaturatedFatGrams:
      typeof item.polyunsaturated_fat_grams === "number"
        ? item.polyunsaturated_fat_grams
        : 0,
    monounsaturatedFatGrams:
      typeof item.monounsaturated_fat_grams === "number"
        ? item.monounsaturated_fat_grams
        : 0,
    cholesterolMilligrams:
      typeof item.cholesterol_milligrams === "number"
        ? item.cholesterol_milligrams
        : 0,
    sodiumMilligrams:
      typeof item.sodium_milligrams === "number" ? item.sodium_milligrams : 0,
    totalCarbohydrateGrams:
      typeof item.total_carbohydrate_grams === "number"
        ? item.total_carbohydrate_grams
        : 0,
    dietaryFiberGrams:
      typeof item.dietary_fiber_grams === "number"
        ? item.dietary_fiber_grams
        : 0,
    totalSugarsGrams:
      typeof item.total_sugars_grams === "number" ? item.total_sugars_grams : 0,
    addedSugarsGrams:
      typeof item.added_sugars_grams === "number" ? item.added_sugars_grams : 0,
    proteinGrams:
      typeof item.protein_grams === "number" ? item.protein_grams : 0,
  };
}
