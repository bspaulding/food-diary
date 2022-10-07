const host = "https://food-diary.motingo.com/api/v1/graphql";

const getEntriesQuery = `
query GetEntries {
    food_diary_diary_entry(order_by: { day: desc, consumed_at: asc }) {
        id
        day
        consumed_at
        calories
        servings
        nutrition_item { id, description, calories }
        recipe { id, name, calories }
    }
}
`;

async function fetchQuery(
  accessToken: string,
  query: string,
  variables: object = {}
) {
  return await fetch(`${host}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });
}

export type DiaryEntry = {
  id: number;
  day: string;
  consumed_at: string;
  servings: number;
  nutrition_item: { id: number; description: string; calories: number };
  recipe: { id: number; name: string; calories: number };
};

export type GetEntriesQueryResponse = {
  data: {
    food_diary_diary_entry: DiaryEntry[];
  };
};

export async function fetchEntries(
  accessToken: string
): Promise<GetEntriesQueryResponse> {
  const response = await fetchQuery(accessToken, getEntriesQuery);
  return response.json();
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

export type SearchItemsAndRecipesQueryResponse = {
  data: {
    food_diary_search_nutrition_items: { id: number; description: string }[];
    food_diary_search_recipes: { id: number; name: string }[];
  };
};

export async function searchItemsAndRecipes(
  accessToken: string,
  search: string
): Promise<SearchItemsAndRecipesQueryResponse> {
  const response = await fetchQuery(accessToken, searchItemsAndRecipesQuery, {
    search,
  });
  return response.json();
}

const searchItemsOnlyQuery = `
query SearchItems($search: String!) {
  food_diary_search_nutrition_items(args: { search: $search }) {
    id,
    description
  }
}
`;

export async function searchItemsOnly(accessToken: string, search: string) {
  const response = await fetchQuery(accessToken, searchItemsOnlyQuery, {
    search,
  });
  return response.json();
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
}

export async function createNutritionItem(
  accessToken: string,
  item: NutritionItem
) {
  const response = await fetchQuery(accessToken, createNutritionItemMutation, {
    nutritionItem: objectToSnakeCaseKeys(item),
  });
  return response.json();
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
  item: NutritionItem
) {
  const response = await fetchQuery(accessToken, updateNutritionItemMutation, {
		id: item.id,
    attrs: objectToSnakeCaseKeys(item),
  });
  return response.json();
}

function isUppercase(s: string): boolean {
  return s === s.toUpperCase();
}

function camelToSnakeCase(s: string): string {
  return Array.from(s).reduce(
    (acc, c) => acc + (isUppercase(c) ? "_" + c.toLowerCase() : c),
    ""
  );
}

function objectToSnakeCaseKeys(o: object): object {
  return Object.entries(o).reduce(
    (acc, [k, v]) => ({ ...acc, [camelToSnakeCase(k)]: v }),
    {}
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
export async function fetchNutritionItem(accessToken: string, id: number) {
  const response = await fetchQuery(accessToken, getNutritionItemQuery, { id });
  return response.json();
}

const getRecentEntriesQuery = `
query GetRecentEntryItems {
  food_diary_recently_logged_items {
    recipe { id, name }
    nutrition_item { id, description }
  }
}
`;

export async function fetchRecentEntries(accessToken: string) {
  return (await fetchQuery(accessToken, getRecentEntriesQuery)).json();
}

const createDiaryEntryQuery = `
mutation CreateDiaryEntry($entry: food_diary_diary_entry_insert_input!) {
  insert_food_diary_diary_entry_one(object: $entry) {
    id
  }
}`;

type CreateDiaryEntryInput =
  | CreateDiaryEntryRecipeInput
  | CreateDiaryEntryItemInput;

type CreateDiaryEntryItemInput = {
  servings: number;
  nutrition_item_id: number;
};

type CreateDiaryEntryRecipeInput = {
  servings: number;
  recipe_id: number;
};

export async function createDiaryEntry(
  accessToken: string,
  entry: CreateDiaryEntryInput
) {
  return (
    await fetchQuery(accessToken, createDiaryEntryQuery, { entry })
  ).json();
}

const deleteDiaryEntryQuery = `
mutation DeleteEntry($id: Int!) {
  delete_food_diary_diary_entry_by_pk(id: $id) {
    id
  }
}`;

export async function deleteDiaryEntry(accessToken: string, id: number) {
  return (await fetchQuery(accessToken, deleteDiaryEntryQuery, { id })).json();
}

export type InsertRecipeInput = {
  name: string;
  total_servings: number;
  recipe_items: InsertRecipeItemInput[];
};

export type InsertRecipeItemInput =
  | InsertRecipeItemExistingItem
  | InsertRecipeItemNewItem;

export type InsertRecipeItemExistingItem = {
  servings: number;
  nutrition_item: { id: number; description: string };
};

export type InsertRecipeItemNewItem = {
  servings: number;
  nutrition_item: NutritionItem;
};

const createRecipeMutation = `
mutation CreateRecipe($input: food_diary_recipe_insert_input!) {
  insert_food_diary_recipe_one(object: $input) {
    id
  }
}
`;

export async function createRecipe(
  accessToken: string,
  formInput: InsertRecipeInput
) {
  const input = {
    ...formInput,
    recipe_items: {
      data: formInput.recipe_items.map((item) => ({
        servings: item.servings,
        nutrition_item_id: item.nutrition_item.id,
      })),
    },
  };
  return (
    await fetchQuery(accessToken, createRecipeMutation, { input })
  ).json();
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
        description
      }
    }
  }
}
`;

export async function fetchRecipe(accessToken: string, id: number) {
  return (await fetchQuery(accessToken, fetchRecipeQuery, { id })).json();
}

export type NewDiaryEntry = {
	consumed_at: string,
	servings: number,
	nutrition_item: NutritionItemAttrs
}

const insertDiaryEntriesWithItemsMutation = `
mutation InsertDiaryEntriesWithNewItems($entries: [food_diary_diary_entry_insert_input!]!){
  insert_food_diary_diary_entry(objects: $entries) {
    affected_rows
  }
}
`;

export async function insertDiaryEntries(accessToken: string, entries: NewDiaryEntry[]) {
	return (await fetchQuery(
					accessToken,
					insertDiaryEntriesWithItemsMutation, {
						entries: entries.map(entry => ({
								...entry,
									nutrition_item: {
													data: objectToSnakeCaseKeys(entry.nutrition_item),
									}
						}))
					})).json();
}
