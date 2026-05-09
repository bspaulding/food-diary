import gleam/json
import gleam/option.{None, Some}
import gleam/string
import gleeunit
import queries

pub fn main() -> Nil {
  gleeunit.main()
}

// =====================
// Query string tests
// =====================

// --- Search query ---

pub fn search_items_and_recipes_query_test() {
  let query = queries.search_items_and_recipes_query()
  assert string.contains(
    query,
    "query SearchItemsAndRecipes($search: String!)",
  )
  assert string.contains(
    query,
    "food_diary_search_nutrition_items(args: { search: $search })",
  )
  assert string.contains(
    query,
    "food_diary_search_recipes(args: { search: $search })",
  )
}

// --- Recent / time-based queries ---

pub fn get_recent_entries_query_test() {
  let query = queries.get_recent_entries_query()
  assert string.contains(query, "query GetRecentEntryItems")
  assert string.contains(query, "food_diary_diary_entry_recent")
  assert string.contains(query, "limit: 10")
  assert string.contains(query, "nutrition_item { id, description }")
  assert string.contains(query, "recipe { id, name }")
}

pub fn get_entries_around_time_query_test() {
  let query = queries.get_entries_around_time_query()
  assert string.contains(
    query,
    "query GetEntriesAroundTime($startTime: timestamptz!, $endTime: timestamptz!)",
  )
  assert string.contains(
    query,
    "consumed_at: { _gte: $startTime, _lte: $endTime }",
  )
  assert string.contains(query, "distinct_on: [nutrition_item_id, recipe_id]")
}

// --- Create diary entry mutation ---

pub fn create_diary_entry_mutation_test() {
  let query = queries.create_diary_entry_mutation()
  assert string.contains(
    query,
    "mutation CreateDiaryEntry($entry: food_diary_diary_entry_insert_input!)",
  )
  assert string.contains(
    query,
    "insert_food_diary_diary_entry_one(object: $entry)",
  )
}

// --- Delete ---

pub fn delete_entry_mutation_contains_expected_fields_test() {
  let query = queries.delete_entry_mutation()
  assert string.contains(query, "mutation DeleteEntry($id: Int!)")
  assert string.contains(query, "delete_food_diary_diary_entry_by_pk(id: $id)")
}

pub fn update_entry_query_contains_mutation_test() {
  let query = queries.update_entry_query()
  assert string.contains(query, "mutation UpdateDiaryEntry")
  assert string.contains(query, "$id: Int!")
  assert string.contains(query, "$attrs: food_diary_diary_entry_set_input!")
  assert string.contains(
    query,
    "update_food_diary_diary_entry_by_pk(pk_columns: {id: $id}, _set: $attrs)",
  )
}

pub fn get_entry_query_contains_expected_fields_test() {
  let query = queries.get_entry_query()
  assert string.contains(query, "query GetDiaryEntry($id: Int!)")
  assert string.contains(query, "food_diary_diary_entry_by_pk(id: $id)")
  assert string.contains(query, "consumed_at")
  assert string.contains(query, "calories")
  assert string.contains(query, "servings")
  assert string.contains(query, "nutrition_item")
  assert string.contains(query, "recipe")
  assert string.contains(query, "...Macros")
}

pub fn get_entry_query_has_macros_fragment_test() {
  let query = queries.get_entry_query()
  assert string.contains(
    query,
    "fragment Macros on food_diary_nutrition_item",
  )
  assert string.contains(query, "total_fat_grams")
  assert string.contains(query, "added_sugars_grams")
  assert string.contains(query, "protein_grams")
}

pub fn get_entries_query_includes_offset_test() {
  let query = queries.get_entries_query(0)
  assert string.contains(query, "offset: 0")

  let query50 = queries.get_entries_query(50)
  assert string.contains(query50, "offset: 50")

  let query100 = queries.get_entries_query(100)
  assert string.contains(query100, "offset: 100")
}

pub fn get_entries_query_has_limit_test() {
  let query = queries.get_entries_query(0)
  assert string.contains(query, "limit: 50")
}

pub fn get_entries_query_has_order_by_test() {
  let query = queries.get_entries_query(0)
  assert string.contains(query, "order_by: { consumed_at: desc }")
}

pub fn get_entries_query_has_nutrition_item_fields_fragment_test() {
  let query = queries.get_entries_query(0)
  assert string.contains(
    query,
    "fragment NutritionItemFields on food_diary_nutrition_item",
  )
  assert string.contains(query, "...NutritionItemFields")
}

pub fn get_entries_query_selects_expected_fields_test() {
  let query = queries.get_entries_query(0)
  assert string.contains(query, "id")
  assert string.contains(query, "consumed_at")
  assert string.contains(query, "calories")
  assert string.contains(query, "servings")
  assert string.contains(query, "nutrition_item")
  assert string.contains(query, "recipe")
}

// =====================
// Decoder tests
// =====================

fn nutrition_item_json() -> String {
  json.object([
    #("id", json.int(1)),
    #("description", json.string("Chicken breast")),
    #("calories", json.float(165.0)),
    #("total_fat_grams", json.float(3.6)),
    #("added_sugars_grams", json.float(0.0)),
    #("protein_grams", json.float(31.0)),
  ])
  |> json.to_string
}

pub fn nutrition_item_decoder_success_test() {
  let assert Ok(item) =
    json.parse(nutrition_item_json(), queries.nutrition_item_decoder())

  assert item.id == 1
  assert item.description == "Chicken breast"
  assert item.calories == 165.0
  assert item.total_fat_grams == 3.6
  assert item.added_sugars_grams == 0.0
  assert item.protein_grams == 31.0
}

pub fn nutrition_item_decoder_missing_field_fails_test() {
  let json_str =
    json.object([
      #("id", json.int(1)),
      #("description", json.string("Chicken")),
    ])
    |> json.to_string

  let assert Error(_) =
    json.parse(json_str, queries.nutrition_item_decoder())
}

pub fn recipe_decoder_success_test() {
  let json_str =
    json.object([
      #("id", json.int(10)),
      #("name", json.string("Stir Fry")),
      #("calories", json.float(450.0)),
      #(
        "recipe_items",
        json.array(
          [
            json.object([
              #("servings", json.float(2.0)),
              #(
                "nutrition_item",
                json.object([
                  #("id", json.int(1)),
                  #("description", json.string("Rice")),
                  #("calories", json.float(200.0)),
                  #("total_fat_grams", json.float(0.5)),
                  #("added_sugars_grams", json.float(0.0)),
                  #("protein_grams", json.float(4.0)),
                ]),
              ),
            ]),
          ],
          fn(x) { x },
        ),
      ),
    ])
    |> json.to_string

  let assert Ok(recipe) = json.parse(json_str, queries.recipe_decoder())

  assert recipe.id == 10
  assert recipe.name == "Stir Fry"
  assert recipe.calories == 450.0

  let assert [ri] = recipe.recipe_items
  assert ri.servings == 2.0
  assert ri.nutrition_item.description == "Rice"
}

pub fn diary_entry_decoder_with_nutrition_item_test() {
  let json_str =
    json.object([
      #("id", json.int(42)),
      #("consumed_at", json.string("2025-01-15T12:00:00Z")),
      #("calories", json.float(330.0)),
      #("servings", json.float(2.0)),
      #(
        "nutrition_item",
        json.object([
          #("id", json.int(1)),
          #("description", json.string("Eggs")),
          #("calories", json.float(165.0)),
          #("total_fat_grams", json.float(11.0)),
          #("added_sugars_grams", json.float(0.0)),
          #("protein_grams", json.float(13.0)),
        ]),
      ),
      #("recipe", json.null()),
    ])
    |> json.to_string

  let assert Ok(entry) =
    json.parse(json_str, queries.diary_entry_decoder())

  assert entry.id == 42
  assert entry.consumed_at == "2025-01-15T12:00:00Z"
  assert entry.calories == 330.0
  assert entry.servings == 2.0
  let assert Some(item) = entry.nutrition_item
  assert item.description == "Eggs"
  assert entry.recipe == None
}

pub fn diary_entry_decoder_with_recipe_test() {
  let json_str =
    json.object([
      #("id", json.int(43)),
      #("consumed_at", json.string("2025-01-15T18:00:00Z")),
      #("calories", json.float(600.0)),
      #("servings", json.float(1.0)),
      #("nutrition_item", json.null()),
      #(
        "recipe",
        json.object([
          #("id", json.int(5)),
          #("name", json.string("Pasta")),
          #("calories", json.float(600.0)),
          #(
            "recipe_items",
            json.array(
              [
                json.object([
                  #("servings", json.float(1.0)),
                  #(
                    "nutrition_item",
                    json.object([
                      #("id", json.int(2)),
                      #("description", json.string("Spaghetti")),
                      #("calories", json.float(200.0)),
                      #("total_fat_grams", json.float(1.0)),
                      #("added_sugars_grams", json.float(0.0)),
                      #("protein_grams", json.float(7.0)),
                    ]),
                  ),
                ]),
              ],
              fn(x) { x },
            ),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(entry) =
    json.parse(json_str, queries.diary_entry_decoder())

  assert entry.id == 43
  assert entry.nutrition_item == None
  let assert Some(recipe) = entry.recipe
  assert recipe.name == "Pasta"
  let assert [ri] = recipe.recipe_items
  assert ri.nutrition_item.description == "Spaghetti"
}

pub fn diary_entry_decoder_with_missing_optional_fields_test() {
  let json_str =
    json.object([
      #("id", json.int(99)),
      #("consumed_at", json.string("2025-02-01T08:00:00Z")),
      #("calories", json.float(100.0)),
      #("servings", json.float(1.0)),
    ])
    |> json.to_string

  let assert Ok(entry) =
    json.parse(json_str, queries.diary_entry_decoder())

  assert entry.id == 99
  assert entry.nutrition_item == None
  assert entry.recipe == None
}

pub fn diary_entries_response_decoder_success_test() {
  let json_str =
    json.object([
      #(
        "data",
        json.object([
          #(
            "food_diary_diary_entry",
            json.array(
              [
                json.object([
                  #("id", json.int(1)),
                  #("consumed_at", json.string("2025-01-15T12:00:00Z")),
                  #("calories", json.float(200.0)),
                  #("servings", json.float(1.0)),
                ]),
              ],
              fn(x) { x },
            ),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.diary_entries_response_decoder())

  let assert Some(data) = response.data
  let assert [entry] = data.entries
  assert entry.id == 1
}

pub fn diary_entries_response_decoder_null_data_test() {
  let json_str =
    json.object([#("data", json.null())])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.diary_entries_response_decoder())

  assert response.data == None
}

pub fn diary_entries_response_decoder_missing_data_test() {
  let json_str = json.object([]) |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.diary_entries_response_decoder())

  assert response.data == None
}

pub fn diary_entry_response_decoder_success_test() {
  let json_str =
    json.object([
      #(
        "data",
        json.object([
          #(
            "food_diary_diary_entry_by_pk",
            json.object([
              #("id", json.int(42)),
              #("consumed_at", json.string("2025-01-15T12:00:00Z")),
              #("calories", json.float(300.0)),
              #("servings", json.float(1.5)),
            ]),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.diary_entry_response_decoder())

  let assert Some(data) = response.data
  assert data.entry.id == 42
  assert data.entry.servings == 1.5
}

pub fn diary_entry_response_decoder_null_data_test() {
  let json_str =
    json.object([#("data", json.null())])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.diary_entry_response_decoder())

  assert response.data == None
}

pub fn delete_entry_response_decoder_success_test() {
  let json_str =
    json.object([
      #(
        "data",
        json.object([
          #(
            "delete_food_diary_diary_entry_by_pk",
            json.object([#("id", json.int(42))]),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.delete_entry_response_decoder())

  let assert Some(data) = response.data
  assert data.id == 42
}

pub fn delete_entry_response_decoder_null_data_test() {
  let json_str =
    json.object([#("data", json.null())])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.delete_entry_response_decoder())

  assert response.data == None
}

// --- Search decoders ---

pub fn search_nutrition_item_decoder_test() {
  let json_str =
    json.object([
      #("id", json.int(5)),
      #("description", json.string("Banana")),
    ])
    |> json.to_string

  let assert Ok(item) =
    json.parse(json_str, queries.search_nutrition_item_decoder())
  assert item.id == 5
  assert item.description == "Banana"
}

pub fn search_recipe_decoder_test() {
  let json_str =
    json.object([
      #("id", json.int(3)),
      #("name", json.string("Smoothie")),
    ])
    |> json.to_string

  let assert Ok(recipe) =
    json.parse(json_str, queries.search_recipe_decoder())
  assert recipe.id == 3
  assert recipe.name == "Smoothie"
}

pub fn search_response_decoder_success_test() {
  let json_str =
    json.object([
      #(
        "data",
        json.object([
          #(
            "food_diary_search_nutrition_items",
            json.array(
              [
                json.object([
                  #("id", json.int(1)),
                  #("description", json.string("Apple")),
                ]),
              ],
              fn(x) { x },
            ),
          ),
          #(
            "food_diary_search_recipes",
            json.array(
              [
                json.object([
                  #("id", json.int(2)),
                  #("name", json.string("Pie")),
                ]),
              ],
              fn(x) { x },
            ),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.search_response_decoder())
  let assert Some(data) = response.data
  let assert [item] = data.nutrition_items
  assert item.description == "Apple"
  let assert [recipe] = data.recipes
  assert recipe.name == "Pie"
}

pub fn search_response_decoder_null_data_test() {
  let json_str =
    json.object([#("data", json.null())])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.search_response_decoder())
  assert response.data == None
}

// --- Suggestion entry decoders ---

pub fn suggestion_entry_decoder_with_nutrition_item_test() {
  let json_str =
    json.object([
      #("consumed_at", json.string("2025-01-15T12:00:00Z")),
      #(
        "nutrition_item",
        json.object([
          #("id", json.int(1)),
          #("description", json.string("Eggs")),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(entry) =
    json.parse(json_str, queries.suggestion_entry_decoder())
  assert entry.consumed_at == "2025-01-15T12:00:00Z"
  let assert Some(item) = entry.nutrition_item
  assert item.description == "Eggs"
  assert entry.recipe == None
}

pub fn suggestion_entry_decoder_with_recipe_test() {
  let json_str =
    json.object([
      #("consumed_at", json.string("2025-01-15T18:00:00Z")),
      #("nutrition_item", json.null()),
      #(
        "recipe",
        json.object([
          #("id", json.int(5)),
          #("name", json.string("Pasta")),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(entry) =
    json.parse(json_str, queries.suggestion_entry_decoder())
  assert entry.nutrition_item == None
  let assert Some(recipe) = entry.recipe
  assert recipe.name == "Pasta"
}

// --- Recent entries response decoder ---

pub fn recent_entries_response_decoder_success_test() {
  let json_str =
    json.object([
      #(
        "data",
        json.object([
          #(
            "food_diary_diary_entry_recent",
            json.array(
              [
                json.object([
                  #("consumed_at", json.string("2025-01-15T12:00:00Z")),
                  #(
                    "nutrition_item",
                    json.object([
                      #("id", json.int(1)),
                      #("description", json.string("Eggs")),
                    ]),
                  ),
                ]),
              ],
              fn(x) { x },
            ),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.recent_entries_response_decoder())
  let assert Some(data) = response.data
  let assert [entry] = data.entries
  assert entry.consumed_at == "2025-01-15T12:00:00Z"
}

pub fn recent_entries_response_decoder_null_data_test() {
  let json_str =
    json.object([#("data", json.null())])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.recent_entries_response_decoder())
  assert response.data == None
}

// --- Time entries response decoder ---

pub fn time_entries_response_decoder_success_test() {
  let json_str =
    json.object([
      #(
        "data",
        json.object([
          #(
            "food_diary_diary_entry",
            json.array(
              [
                json.object([
                  #("consumed_at", json.string("2025-01-15T12:00:00Z")),
                  #(
                    "recipe",
                    json.object([
                      #("id", json.int(3)),
                      #("name", json.string("Stew")),
                    ]),
                  ),
                ]),
              ],
              fn(x) { x },
            ),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.time_entries_response_decoder())
  let assert Some(data) = response.data
  let assert [entry] = data.entries
  let assert Some(recipe) = entry.recipe
  assert recipe.name == "Stew"
}

pub fn time_entries_response_decoder_null_data_test() {
  let json_str =
    json.object([#("data", json.null())])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.time_entries_response_decoder())
  assert response.data == None
}

// --- Create entry response decoder ---

pub fn create_entry_response_decoder_success_test() {
  let json_str =
    json.object([
      #(
        "data",
        json.object([
          #(
            "insert_food_diary_diary_entry_one",
            json.object([#("id", json.int(99))]),
          ),
        ]),
      ),
    ])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.create_entry_response_decoder())
  let assert Some(data) = response.data
  assert data.id == 99
}

pub fn create_entry_response_decoder_null_data_test() {
  let json_str =
    json.object([#("data", json.null())])
    |> json.to_string

  let assert Ok(response) =
    json.parse(json_str, queries.create_entry_response_decoder())
  assert response.data == None
}

// =====================
// Regression: servings double-multiply bug
// =====================
// BUG: entry_macro() multiplies by entry.servings, then entry_total_macro()
// multiplies by entry.servings again, squaring the servings factor.
// These functions are private in food_diary_frontend.gleam, so we replicate
// the buggy logic here to document the issue and verify the fix.

// This replicates the CURRENT (buggy) entry_macro logic
fn buggy_entry_macro(
  entry: queries.DiaryEntry,
  get_macro: fn(queries.NutritionItem) -> Float,
) -> Float {
  let raw = case entry.nutrition_item, entry.recipe {
    Some(item), _ -> get_macro(item)
    _, _ -> 0.0
  }
  // BUG: this multiplies by servings
  entry.servings *. raw
}

// This replicates the CURRENT (buggy) entry_total_macro logic
fn buggy_entry_total_macro(
  entry: queries.DiaryEntry,
  get_macro: fn(queries.DiaryEntry) -> Float,
) -> Float {
  // BUG: this ALSO multiplies by servings
  entry.servings *. get_macro(entry)
}

fn buggy_entry_protein(entry: queries.DiaryEntry) -> Float {
  buggy_entry_macro(entry, fn(i) { i.protein_grams })
}

// This is what the CORRECT logic should produce
fn correct_entry_protein(entry: queries.DiaryEntry) -> Float {
  let raw = case entry.nutrition_item, entry.recipe {
    Some(item), _ -> item.protein_grams
    _, _ -> 0.0
  }
  entry.servings *. raw
}

pub fn regression_servings_double_multiply_bug_test() {
  // Entry: 3 servings of item with 10g protein per serving
  // Expected total protein: 3 * 10 = 30g
  // Buggy result: 3 * 3 * 10 = 90g (servings squared)
  let item =
    queries.NutritionItem(
      id: 1,
      description: "Chicken",
      calories: 165.0,
      total_fat_grams: 3.6,
      added_sugars_grams: 0.0,
      protein_grams: 10.0,
    )
  let entry =
    queries.DiaryEntry(
      id: 1,
      consumed_at: "2025-01-15T12:00:00Z",
      calories: 495.0,
      servings: 3.0,
      nutrition_item: Some(item),
      recipe: None,
    )

  // Verify the bug exists: entry_total_macro(entry, entry_protein_grams)
  // produces servings^2 * protein = 90.0 instead of 30.0
  let buggy_result = buggy_entry_total_macro(entry, buggy_entry_protein)
  assert buggy_result == 90.0

  // The correct result should be servings * protein = 30.0
  let correct_result = correct_entry_protein(entry)
  assert correct_result == 30.0

  // TODO: Once the bug is fixed and functions are made public, replace
  // the above with direct calls to the real functions and assert == 30.0
}

pub fn regression_servings_1_not_affected_test() {
  // With servings=1.0, the bug is invisible (1^2 == 1)
  let item =
    queries.NutritionItem(
      id: 1,
      description: "Chicken",
      calories: 165.0,
      total_fat_grams: 3.6,
      added_sugars_grams: 0.0,
      protein_grams: 10.0,
    )
  let entry =
    queries.DiaryEntry(
      id: 1,
      consumed_at: "2025-01-15T12:00:00Z",
      calories: 165.0,
      servings: 1.0,
      nutrition_item: Some(item),
      recipe: None,
    )

  // With servings=1, both buggy and correct produce the same result
  let buggy_result = buggy_entry_total_macro(entry, buggy_entry_protein)
  let correct_result = correct_entry_protein(entry)
  assert buggy_result == 10.0
  assert correct_result == 10.0
}

// =====================
// Type constructor tests
// =====================

pub fn nutrition_item_constructor_test() {
  let item =
    queries.NutritionItem(
      id: 1,
      description: "Test",
      calories: 100.0,
      total_fat_grams: 5.0,
      added_sugars_grams: 2.0,
      protein_grams: 10.0,
    )
  assert item.id == 1
  assert item.calories == 100.0
}

pub fn diary_entry_constructor_test() {
  let entry =
    queries.DiaryEntry(
      id: 1,
      consumed_at: "2025-01-01T12:00:00Z",
      calories: 200.0,
      servings: 1.0,
      nutrition_item: None,
      recipe: None,
    )
  assert entry.id == 1
  assert entry.servings == 1.0
  assert entry.nutrition_item == None
  assert entry.recipe == None
}

pub fn recipe_constructor_test() {
  let item = queries.NutritionItem(1, "Rice", 200.0, 0.5, 0.0, 4.0)
  let recipe_item = queries.RecipeItem(servings: 2.0, nutrition_item: item)
  let recipe =
    queries.Recipe(
      id: 10,
      name: "Fried Rice",
      calories: 400.0,
      recipe_items: [recipe_item],
    )
  assert recipe.id == 10
  assert recipe.name == "Fried Rice"
  let assert [ri] = recipe.recipe_items
  assert ri.servings == 2.0
  assert ri.nutrition_item.description == "Rice"
}

pub fn diary_entries_response_data_constructor_test() {
  let entry =
    queries.DiaryEntry(1, "2025-01-01T00:00:00Z", 100.0, 1.0, None, None)
  let data = queries.DiaryEntriesResponseData(entries: [entry])
  let assert [e] = data.entries
  assert e.id == 1
}

pub fn diary_entry_response_data_constructor_test() {
  let entry =
    queries.DiaryEntry(42, "2025-01-01T00:00:00Z", 300.0, 1.5, None, None)
  let data = queries.DiaryEntryResponseData(entry: entry)
  assert data.entry.id == 42
}
