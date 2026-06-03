import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gql } from "./graphql.js";

const LIST_DIARY_ENTRIES = `
  query ListDiaryEntries($start_date: timestamptz!, $end_date: timestamptz!) {
    food_diary_diary_entry(
      where: { consumed_at: { _gte: $start_date, _lte: $end_date } }
      order_by: { consumed_at: asc }
    ) {
      id
      consumed_at
      servings
      calories
      nutrition_item { id, description, calories, protein_grams, added_sugars_grams, dietary_fiber_grams }
      recipe { id, name, calories, total_servings, recipe_items { servings, nutrition_item { id, description, calories, protein_grams, added_sugars_grams } } }
    }
  }
`;

const SEARCH_FOOD = `
  query SearchFood($search: String!) {
    food_diary_search_nutrition_items(args: { search: $search }) {
      id
      description
      calories
      protein_grams
      added_sugars_grams
    }
    food_diary_search_recipes(args: { search: $search }) {
      id
      name
      calories
      total_servings
    }
  }
`;

const CREATE_DIARY_ENTRY = `
  mutation CreateDiaryEntry($entry: food_diary_diary_entry_insert_input!) {
    insert_food_diary_diary_entry_one(object: $entry) { id }
  }
`;

const UPDATE_DIARY_ENTRY = `
  mutation UpdateDiaryEntry($id: Int!, $attrs: food_diary_diary_entry_set_input!) {
    update_food_diary_diary_entry_by_pk(pk_columns: {id: $id}, _set: $attrs) { id }
  }
`;

const DELETE_DIARY_ENTRY = `
  mutation DeleteDiaryEntry($id: Int!) {
    delete_food_diary_diary_entry_by_pk(id: $id) { id }
  }
`;

const CREATE_NUTRITION_ITEM = `
  mutation CreateNutritionItem($item: food_diary_nutrition_item_insert_input!) {
    insert_food_diary_nutrition_item_one(object: $item) { id, description }
  }
`;

const UPDATE_NUTRITION_ITEM = `
  mutation UpdateNutritionItem($id: Int!, $attrs: food_diary_nutrition_item_set_input!) {
    update_food_diary_nutrition_item_by_pk(pk_columns: {id: $id}, _set: $attrs) { id }
  }
`;

const CREATE_RECIPE = `
  mutation CreateRecipe($input: food_diary_recipe_insert_input!) {
    insert_food_diary_recipe_one(object: $input) { id, name }
  }
`;

const UPDATE_RECIPE = `
  mutation UpdateRecipe($id: Int!, $attrs: food_diary_recipe_set_input!, $items: [food_diary_recipe_item_insert_input!]!) {
    update_food_diary_recipe_by_pk(pk_columns: {id: $id}, _set: $attrs) { id }
    delete_food_diary_recipe_item(where: { recipe_id: { _eq: $id } }) { affected_rows }
    insert_food_diary_recipe_item(objects: $items) { affected_rows }
  }
`;

const UPDATE_RECIPE_ATTRS = `
  mutation UpdateRecipeAttrs($id: Int!, $attrs: food_diary_recipe_set_input!) {
    update_food_diary_recipe_by_pk(pk_columns: {id: $id}, _set: $attrs) { id }
  }
`;

type TextContent = { content: [{ type: "text"; text: string }] };

export async function listDiaryEntries(
  jwt: string,
  args: { start_date: string; end_date: string }
): Promise<TextContent> {
  const data = await gql(jwt, LIST_DIARY_ENTRIES, { start_date: args.start_date, end_date: args.end_date });
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export async function searchFood(jwt: string, args: { query: string }): Promise<TextContent> {
  const data = await gql(jwt, SEARCH_FOOD, { search: args.query });
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export async function createDiaryEntry(
  jwt: string,
  args: { consumed_at: string; servings: number; nutrition_item_id?: number; recipe_id?: number }
): Promise<TextContent> {
  const entry: Record<string, unknown> = { consumed_at: args.consumed_at, servings: args.servings };
  if (args.nutrition_item_id !== undefined) entry.nutrition_item_id = args.nutrition_item_id;
  if (args.recipe_id !== undefined) entry.recipe_id = args.recipe_id;
  const data = await gql<{ insert_food_diary_diary_entry_one: { id: number } }>(
    jwt,
    CREATE_DIARY_ENTRY,
    { entry }
  );
  return {
    content: [{ type: "text", text: `Created diary entry with id: ${data.insert_food_diary_diary_entry_one.id}` }],
  };
}

export async function updateDiaryEntry(
  jwt: string,
  args: { id: number; servings?: number; consumed_at?: string }
): Promise<TextContent> {
  const attrs: Record<string, unknown> = {};
  if (args.servings !== undefined) attrs.servings = args.servings;
  if (args.consumed_at !== undefined) attrs.consumed_at = args.consumed_at;
  await gql(jwt, UPDATE_DIARY_ENTRY, { id: args.id, attrs });
  return { content: [{ type: "text", text: `Updated diary entry ${args.id}` }] };
}

export async function deleteDiaryEntry(jwt: string, args: { id: number }): Promise<TextContent> {
  await gql(jwt, DELETE_DIARY_ENTRY, { id: args.id });
  return { content: [{ type: "text", text: `Deleted diary entry ${args.id}` }] };
}

export async function createNutritionItem(
  jwt: string,
  args: {
    description: string;
    calories: number;
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
    added_sugars_grams: number;
    protein_grams: number;
  }
): Promise<TextContent> {
  const data = await gql<{ insert_food_diary_nutrition_item_one: { id: number; description: string } }>(
    jwt,
    CREATE_NUTRITION_ITEM,
    { item: args }
  );
  const item = data.insert_food_diary_nutrition_item_one;
  return { content: [{ type: "text", text: `Created nutrition item '${item.description}' with id: ${item.id}` }] };
}

export async function updateNutritionItem(
  jwt: string,
  args: {
    id: number;
    description?: string;
    calories?: number;
    total_fat_grams?: number;
    saturated_fat_grams?: number;
    trans_fat_grams?: number;
    polyunsaturated_fat_grams?: number;
    monounsaturated_fat_grams?: number;
    cholesterol_milligrams?: number;
    sodium_milligrams?: number;
    total_carbohydrate_grams?: number;
    dietary_fiber_grams?: number;
    total_sugars_grams?: number;
    added_sugars_grams?: number;
    protein_grams?: number;
  }
): Promise<TextContent> {
  const { id, ...rest } = args;
  const attrs = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  await gql(jwt, UPDATE_NUTRITION_ITEM, { id, attrs });
  return { content: [{ type: "text", text: `Updated nutrition item ${id}` }] };
}

export async function createRecipe(
  jwt: string,
  args: { name: string; total_servings: number; items: Array<{ nutrition_item_id: number; servings: number }> }
): Promise<TextContent> {
  const input = { name: args.name, total_servings: args.total_servings, recipe_items: { data: args.items } };
  const data = await gql<{ insert_food_diary_recipe_one: { id: number; name: string } }>(
    jwt,
    CREATE_RECIPE,
    { input }
  );
  const recipe = data.insert_food_diary_recipe_one;
  return { content: [{ type: "text", text: `Created recipe '${recipe.name}' with id: ${recipe.id}` }] };
}

export async function updateRecipe(
  jwt: string,
  args: {
    id: number;
    name?: string;
    total_servings?: number;
    items?: Array<{ nutrition_item_id: number; servings: number }>;
  }
): Promise<TextContent> {
  const attrs: Record<string, unknown> = {};
  if (args.name !== undefined) attrs.name = args.name;
  if (args.total_servings !== undefined) attrs.total_servings = args.total_servings;

  if (args.items !== undefined) {
    const mappedItems = args.items.map((item) => ({ ...item, recipe_id: args.id }));
    await gql(jwt, UPDATE_RECIPE, { id: args.id, attrs, items: mappedItems });
  } else {
    await gql(jwt, UPDATE_RECIPE_ATTRS, { id: args.id, attrs });
  }

  return { content: [{ type: "text", text: `Updated recipe ${args.id}` }] };
}

export function registerTools(server: McpServer, jwt: string): void {
  server.tool(
    "list_diary_entries",
    "List food diary entries for a date range. Returns ID, consumed_at, servings, calories, and the food item or recipe with key macros.",
    {
      start_date: z.string().describe("Start of range, ISO 8601 (e.g. 2024-01-01T00:00:00Z)"),
      end_date: z.string().describe("End of range, ISO 8601 (e.g. 2024-01-31T23:59:59Z)"),
    },
    (args) => listDiaryEntries(jwt, args)
  );

  server.tool(
    "search_food",
    "Search nutrition items and recipes by name (fuzzy). Returns IDs to use in create/update tools.",
    { query: z.string().describe("Search term") },
    (args) => searchFood(jwt, args)
  );

  server.tool(
    "create_diary_entry",
    "Log a food item or recipe. Provide either nutrition_item_id or recipe_id (not both).",
    {
      consumed_at: z.string().describe("ISO 8601 datetime"),
      servings: z.number().describe("Number of servings"),
      nutrition_item_id: z.number().optional().describe("ID from search_food"),
      recipe_id: z.number().optional().describe("ID from search_food"),
    },
    (args) => createDiaryEntry(jwt, args)
  );

  server.tool(
    "update_diary_entry",
    "Update the servings or date/time on an existing diary entry.",
    {
      id: z.number().describe("Diary entry ID"),
      servings: z.number().optional().describe("New serving count"),
      consumed_at: z.string().optional().describe("New datetime ISO 8601"),
    },
    (args) => updateDiaryEntry(jwt, args)
  );

  server.tool(
    "delete_diary_entry",
    "Remove a diary entry by ID.",
    { id: z.number().describe("Diary entry ID to delete") },
    (args) => deleteDiaryEntry(jwt, args)
  );

  server.tool(
    "create_nutrition_item",
    "Create a new food item with calorie and macro data. All macro fields default to 0 if omitted.",
    {
      description: z.string().describe("Food item name/description"),
      calories: z.number().describe("Calories per serving"),
      total_fat_grams: z.number().default(0),
      saturated_fat_grams: z.number().default(0),
      trans_fat_grams: z.number().default(0),
      polyunsaturated_fat_grams: z.number().default(0),
      monounsaturated_fat_grams: z.number().default(0),
      cholesterol_milligrams: z.number().default(0),
      sodium_milligrams: z.number().default(0),
      total_carbohydrate_grams: z.number().default(0),
      dietary_fiber_grams: z.number().default(0),
      total_sugars_grams: z.number().default(0),
      added_sugars_grams: z.number().default(0),
      protein_grams: z.number().default(0),
    },
    (args) => createNutritionItem(jwt, args)
  );

  server.tool(
    "update_nutrition_item",
    "Update fields on an existing nutrition item. Only provided fields are updated.",
    {
      id: z.number().describe("Nutrition item ID"),
      description: z.string().optional(),
      calories: z.number().optional(),
      total_fat_grams: z.number().optional(),
      saturated_fat_grams: z.number().optional(),
      trans_fat_grams: z.number().optional(),
      polyunsaturated_fat_grams: z.number().optional(),
      monounsaturated_fat_grams: z.number().optional(),
      cholesterol_milligrams: z.number().optional(),
      sodium_milligrams: z.number().optional(),
      total_carbohydrate_grams: z.number().optional(),
      dietary_fiber_grams: z.number().optional(),
      total_sugars_grams: z.number().optional(),
      added_sugars_grams: z.number().optional(),
      protein_grams: z.number().optional(),
    },
    (args) => updateNutritionItem(jwt, args)
  );

  server.tool(
    "create_recipe",
    "Create a recipe from existing nutrition items.",
    {
      name: z.string().describe("Recipe name"),
      total_servings: z.number().describe("Total servings the recipe makes"),
      items: z
        .array(
          z.object({
            nutrition_item_id: z.number().describe("ID from search_food"),
            servings: z.number().describe("Servings of this item in the recipe"),
          })
        )
        .describe("Ingredient list"),
    },
    (args) => createRecipe(jwt, args)
  );

  server.tool(
    "update_recipe",
    "Update a recipe's name, total servings, or ingredient list. If items is provided, it replaces the entire ingredient list.",
    {
      id: z.number().describe("Recipe ID"),
      name: z.string().optional().describe("New name"),
      total_servings: z.number().optional().describe("New total servings"),
      items: z
        .array(z.object({ nutrition_item_id: z.number(), servings: z.number() }))
        .optional()
        .describe("New ingredient list (replaces existing)"),
    },
    (args) => updateRecipe(jwt, args)
  );
}
