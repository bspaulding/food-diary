import gleam/dynamic/decode
import gleam/int
import gleam/option.{type Option, None}

// --- Search ---

pub fn search_items_and_recipes_query() {
  "query SearchItemsAndRecipes($search: String!) {
  food_diary_search_nutrition_items(args: { search: $search }) {
    id,
    description
  }
  food_diary_search_recipes(args: { search: $search }) {
    id,
    name
  }
}"
}

pub type SearchNutritionItem {
  SearchNutritionItem(id: Int, description: String)
}

pub fn search_nutrition_item_decoder() {
  use id <- decode.field("id", decode.int)
  use description <- decode.field("description", decode.string)
  decode.success(SearchNutritionItem(id, description))
}

pub type SearchRecipe {
  SearchRecipe(id: Int, name: String)
}

pub fn search_recipe_decoder() {
  use id <- decode.field("id", decode.int)
  use name <- decode.field("name", decode.string)
  decode.success(SearchRecipe(id, name))
}

pub type SearchResponseData {
  SearchResponseData(
    nutrition_items: List(SearchNutritionItem),
    recipes: List(SearchRecipe),
  )
}

pub type SearchResponse {
  SearchResponse(data: Option(SearchResponseData))
}

pub fn search_response_decoder() {
  let data_decoder = {
    use nutrition_items <- decode.field(
      "food_diary_search_nutrition_items",
      decode.list(search_nutrition_item_decoder()),
    )
    use recipes <- decode.field(
      "food_diary_search_recipes",
      decode.list(search_recipe_decoder()),
    )
    decode.success(SearchResponseData(nutrition_items, recipes))
  }
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(data_decoder),
  )
  decode.success(SearchResponse(data))
}

// --- Recent / Time-based entries ---

pub fn get_recent_entries_query() {
  "query GetRecentEntryItems {
  food_diary_diary_entry_recent(order_by: {consumed_at:desc}, limit: 10) {
    consumed_at
    nutrition_item { id, description }
    recipe { id, name }
  }
}"
}

pub fn get_entries_around_time_query() {
  "query GetEntriesAroundTime($startTime: timestamptz!, $endTime: timestamptz!) {
  food_diary_diary_entry(
    where: {
      consumed_at: { _gte: $startTime, _lte: $endTime }
    }
    order_by: {consumed_at: desc}
    distinct_on: [nutrition_item_id, recipe_id]
  ) {
    consumed_at
    nutrition_item { id, description }
    recipe { id, name }
  }
}"
}

pub type SuggestionEntry {
  SuggestionEntry(
    consumed_at: String,
    nutrition_item: Option(SearchNutritionItem),
    recipe: Option(SearchRecipe),
  )
}

pub fn suggestion_entry_decoder() {
  use consumed_at <- decode.field("consumed_at", decode.string)
  use nutrition_item <- decode.optional_field(
    "nutrition_item",
    None,
    decode.optional(search_nutrition_item_decoder()),
  )
  use recipe <- decode.optional_field(
    "recipe",
    None,
    decode.optional(search_recipe_decoder()),
  )
  decode.success(SuggestionEntry(consumed_at, nutrition_item, recipe))
}

pub type RecentEntriesResponseData {
  RecentEntriesResponseData(entries: List(SuggestionEntry))
}

pub type RecentEntriesResponse {
  RecentEntriesResponse(data: Option(RecentEntriesResponseData))
}

pub fn recent_entries_response_decoder() {
  let data_decoder = {
    use entries <- decode.field(
      "food_diary_diary_entry_recent",
      decode.list(suggestion_entry_decoder()),
    )
    decode.success(RecentEntriesResponseData(entries))
  }
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(data_decoder),
  )
  decode.success(RecentEntriesResponse(data))
}

pub type TimeEntriesResponseData {
  TimeEntriesResponseData(entries: List(SuggestionEntry))
}

pub type TimeEntriesResponse {
  TimeEntriesResponse(data: Option(TimeEntriesResponseData))
}

pub fn time_entries_response_decoder() {
  let data_decoder = {
    use entries <- decode.field(
      "food_diary_diary_entry",
      decode.list(suggestion_entry_decoder()),
    )
    decode.success(TimeEntriesResponseData(entries))
  }
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(data_decoder),
  )
  decode.success(TimeEntriesResponse(data))
}

// --- Create Diary Entry ---

pub fn create_diary_entry_mutation() {
  "mutation CreateDiaryEntry($entry: food_diary_diary_entry_insert_input!) {
  insert_food_diary_diary_entry_one(object: $entry) {
    id
  }
}"
}

pub type CreateEntryResponseData {
  CreateEntryResponseData(id: Int)
}

pub type CreateEntryResponse {
  CreateEntryResponse(data: Option(CreateEntryResponseData))
}

pub fn create_entry_response_decoder() {
  let data_decoder = {
    use id <- decode.field("insert_food_diary_diary_entry_one", {
      use id <- decode.field("id", decode.int)
      decode.success(id)
    })
    decode.success(CreateEntryResponseData(id: id))
  }
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(data_decoder),
  )
  decode.success(CreateEntryResponse(data))
}

// --- Delete ---

pub fn delete_entry_mutation() {
  "mutation DeleteEntry($id: Int!) {
  delete_food_diary_diary_entry_by_pk(id: $id) {
    id
  }
}"
}

pub fn update_entry_query() {
  "mutation UpdateDiaryEntry($id: Int!, $attrs: food_diary_diary_entry_set_input!) {
  update_food_diary_diary_entry_by_pk(pk_columns: {id: $id}, _set: $attrs) {
    id
  }
}"
}

pub fn get_entry_query() {
  "fragment Macros on food_diary_nutrition_item {
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
    recipe { id, name, calories, recipe_items { servings, nutrition_item { ...Macros } } }
  }
}"
}

pub fn get_entries_query(offset: Int) {
  "fragment NutritionItemFields on food_diary_nutrition_item {
  id
  description
  calories
	total_fat_grams
  added_sugars_grams
	protein_grams
}

query GetEntries {
    food_diary_diary_entry(order_by: { consumed_at: desc }, limit: 50, offset: " <> int.to_string(
    offset,
  ) <> ") {
        id
        consumed_at
        calories
        servings
        nutrition_item { ...NutritionItemFields }
        recipe { id, name, calories, recipe_items { servings, nutrition_item { ...NutritionItemFields } } }
    }
}"
}

pub type NutritionItem {
  NutritionItem(
    id: Int,
    description: String,
    calories: Float,
    total_fat_grams: Float,
    added_sugars_grams: Float,
    protein_grams: Float,
  )
}

pub fn nutrition_item_decoder() {
  use id <- decode.field("id", decode.int)
  use description <- decode.field("description", decode.string)
  use calories <- decode.field("calories", decode.float)
  use total_fat_grams <- decode.field("total_fat_grams", decode.float)
  use added_sugars_grams <- decode.field("added_sugars_grams", decode.float)
  use protein_grams <- decode.field("protein_grams", decode.float)
  decode.success(NutritionItem(
    id,
    description,
    calories,
    total_fat_grams,
    added_sugars_grams,
    protein_grams,
  ))
}

pub type RecipeItem {
  RecipeItem(servings: Float, nutrition_item: NutritionItem)
}

fn recipe_item_decoder() {
  use servings <- decode.field("servings", decode.float)
  use nutrition_item <- decode.field("nutrition_item", nutrition_item_decoder())
  decode.success(RecipeItem(servings, nutrition_item))
}

pub type Recipe {
  Recipe(id: Int, name: String, calories: Float, recipe_items: List(RecipeItem))
}

pub fn recipe_decoder() {
  use id <- decode.field("id", decode.int)
  use name <- decode.field("name", decode.string)
  use calories <- decode.field("calories", decode.float)
  use recipe_items <- decode.field(
    "recipe_items",
    decode.list(recipe_item_decoder()),
  )
  decode.success(Recipe(id, name, calories, recipe_items))
}

pub type DiaryEntry {
  DiaryEntry(
    id: Int,
    consumed_at: String,
    calories: Float,
    servings: Float,
    nutrition_item: Option(NutritionItem),
    recipe: Option(Recipe),
  )
}

pub fn diary_entry_decoder() {
  use id <- decode.field("id", decode.int)
  use consumed_at <- decode.field("consumed_at", decode.string)
  use calories <- decode.field("calories", decode.float)
  use servings <- decode.field("servings", decode.float)
  use nutrition_item <- decode.optional_field(
    "nutrition_item",
    None,
    decode.optional(nutrition_item_decoder()),
  )
  use recipe <- decode.optional_field(
    "recipe",
    None,
    decode.optional(recipe_decoder()),
  )
  decode.success(DiaryEntry(
    id: id,
    consumed_at: consumed_at,
    calories: calories,
    servings: servings,
    nutrition_item: nutrition_item,
    recipe: recipe,
  ))
}

pub type DiaryEntriesResponseData {
  DiaryEntriesResponseData(entries: List(DiaryEntry))
}

pub fn diary_entries_response_data_decoder() {
  use entries <- decode.field(
    "food_diary_diary_entry",
    decode.list(diary_entry_decoder()),
  )
  decode.success(DiaryEntriesResponseData(entries: entries))
}

pub type DiaryEntriesResponse {
  DiaryEntriesResponse(data: Option(DiaryEntriesResponseData))
}

pub fn diary_entries_response_decoder() {
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(diary_entries_response_data_decoder()),
  )
  decode.success(DiaryEntriesResponse(data))
}

pub type DiaryEntryResponseData {
  DiaryEntryResponseData(entry: DiaryEntry)
}

fn food_diary_diary_entry_by_pk_decoder() {
  use entry <- decode.field(
    "food_diary_diary_entry_by_pk",
    diary_entry_decoder(),
  )
  decode.success(DiaryEntryResponseData(entry: entry))
}

pub type DiaryEntryResponse {
  DiaryEntryResponse(data: Option(DiaryEntryResponseData))
}

pub fn diary_entry_response_decoder() {
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(food_diary_diary_entry_by_pk_decoder()),
  )
  decode.success(DiaryEntryResponse(data))
}

pub type DeleteEntryResponseData {
  DeleteEntryResponseData(id: Int)
}

pub type DeleteEntryResponse {
  DeleteEntryResponse(data: Option(DeleteEntryResponseData))
}

pub fn delete_entry_response_decoder() {
  let id_decoder = {
    use id <- decode.field("delete_food_diary_diary_entry_by_pk", {
      use id <- decode.field("id", decode.int)
      decode.success(id)
    })
    decode.success(DeleteEntryResponseData(id: id))
  }
  use data <- decode.optional_field(
    "data",
    None,
    decode.optional(id_decoder),
  )
  decode.success(DeleteEntryResponse(data))
}
