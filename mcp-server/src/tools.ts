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

export function registerTools(server: McpServer, jwt: string): void {
  server.tool(
    "list_diary_entries",
    "List food diary entries for a date range. Returns ID, consumed_at, servings, calories, and the food item or recipe with key macros.",
    {
      start_date: z.string().describe("Start of range, ISO 8601 (e.g. 2024-01-01T00:00:00Z)"),
      end_date: z.string().describe("End of range, ISO 8601 (e.g. 2024-01-31T23:59:59Z)"),
    },
    async ({ start_date, end_date }) => {
      const data = await gql(jwt, LIST_DIARY_ENTRIES, { start_date, end_date });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search_food",
    "Search nutrition items and recipes by name (fuzzy). Returns IDs to use in create/update tools.",
    {
      query: z.string().describe("Search term"),
    },
    async ({ query }) => {
      const data = await gql(jwt, SEARCH_FOOD, { search: query });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
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
    async ({ consumed_at, servings, nutrition_item_id, recipe_id }) => {
      const entry: Record<string, unknown> = { consumed_at, servings };
      if (nutrition_item_id !== undefined) entry.nutrition_item_id = nutrition_item_id;
      if (recipe_id !== undefined) entry.recipe_id = recipe_id;
      const data = await gql<{ insert_food_diary_diary_entry_one: { id: number } }>(
        jwt,
        CREATE_DIARY_ENTRY,
        { entry }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Created diary entry with id: ${data.insert_food_diary_diary_entry_one.id}`,
          },
        ],
      };
    }
  );

  server.tool(
    "update_diary_entry",
    "Update the servings or date/time on an existing diary entry.",
    {
      id: z.number().describe("Diary entry ID"),
      servings: z.number().optional().describe("New serving count"),
      consumed_at: z.string().optional().describe("New datetime ISO 8601"),
    },
    async ({ id, servings, consumed_at }) => {
      const attrs: Record<string, unknown> = {};
      if (servings !== undefined) attrs.servings = servings;
      if (consumed_at !== undefined) attrs.consumed_at = consumed_at;
      await gql(jwt, UPDATE_DIARY_ENTRY, { id, attrs });
      return { content: [{ type: "text" as const, text: `Updated diary entry ${id}` }] };
    }
  );

  server.tool(
    "delete_diary_entry",
    "Remove a diary entry by ID.",
    {
      id: z.number().describe("Diary entry ID to delete"),
    },
    async ({ id }) => {
      await gql(jwt, DELETE_DIARY_ENTRY, { id });
      return { content: [{ type: "text" as const, text: `Deleted diary entry ${id}` }] };
    }
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
    async (args) => {
      const data = await gql<{
        insert_food_diary_nutrition_item_one: { id: number; description: string };
      }>(jwt, CREATE_NUTRITION_ITEM, { item: args });
      const item = data.insert_food_diary_nutrition_item_one;
      return {
        content: [
          {
            type: "text" as const,
            text: `Created nutrition item '${item.description}' with id: ${item.id}`,
          },
        ],
      };
    }
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
    async ({ id, ...rest }) => {
      const attrs = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined)
      );
      await gql(jwt, UPDATE_NUTRITION_ITEM, { id, attrs });
      return { content: [{ type: "text" as const, text: `Updated nutrition item ${id}` }] };
    }
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
    async ({ name, total_servings, items }) => {
      const input = {
        name,
        total_servings,
        recipe_items: { data: items },
      };
      const data = await gql<{ insert_food_diary_recipe_one: { id: number; name: string } }>(
        jwt,
        CREATE_RECIPE,
        { input }
      );
      const recipe = data.insert_food_diary_recipe_one;
      return {
        content: [
          {
            type: "text" as const,
            text: `Created recipe '${recipe.name}' with id: ${recipe.id}`,
          },
        ],
      };
    }
  );

  server.tool(
    "update_recipe",
    "Update a recipe's name, total servings, or ingredient list. If items is provided, it replaces the entire ingredient list.",
    {
      id: z.number().describe("Recipe ID"),
      name: z.string().optional().describe("New name"),
      total_servings: z.number().optional().describe("New total servings"),
      items: z
        .array(
          z.object({
            nutrition_item_id: z.number(),
            servings: z.number(),
          })
        )
        .optional()
        .describe("New ingredient list (replaces existing)"),
    },
    async ({ id, name, total_servings, items }) => {
      const attrs: Record<string, unknown> = {};
      if (name !== undefined) attrs.name = name;
      if (total_servings !== undefined) attrs.total_servings = total_servings;

      if (items !== undefined) {
        const mappedItems = items.map((item) => ({ ...item, recipe_id: id }));
        await gql(jwt, UPDATE_RECIPE, { id, attrs, items: mappedItems });
      } else {
        await gql(jwt, UPDATE_RECIPE_ATTRS, { id, attrs });
      }

      return { content: [{ type: "text" as const, text: `Updated recipe ${id}` }] };
    }
  );
}
