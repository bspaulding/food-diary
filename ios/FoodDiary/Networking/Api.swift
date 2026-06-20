import Foundation

/// Home for GraphQL query/mutation strings, mirroring `web/src/Api.ts` 1:1.
enum Api {
    enum Diary {
        static let macrosFragment = """
            fragment Macros on food_diary_nutrition_item {
              added_sugars_grams
              protein_grams
              dietary_fiber_grams
            }
            """

        static let entryFields = """
            id
            consumed_at
            calories
            servings
            nutrition_item { id, description, calories, ...Macros }
            recipe { id, name, calories, total_servings, recipe_items { servings, nutrition_item { ...Macros } } }
            """

        static let getEntries = """
            \(macrosFragment)
            query GetEntries {
              food_diary_diary_entry(order_by: { day: desc, consumed_at: asc }) { \(entryFields) }
            }
            """

        static let getEntriesFromDate = """
            \(macrosFragment)
            query GetEntries($startDate: timestamptz!) {
              food_diary_diary_entry(
                where: { consumed_at: { _gte: $startDate } }
                order_by: { day: desc, consumed_at: asc }
              ) { \(entryFields) }
            }
            """

        static let getEntriesDateRange = """
            \(macrosFragment)
            query GetEntries($startDate: timestamptz!, $endDate: timestamptz!) {
              food_diary_diary_entry(
                where: { consumed_at: { _gte: $startDate, _lt: $endDate } }
                order_by: { day: desc, consumed_at: asc }
              ) { \(entryFields) }
            }
            """

        static let getDiaryEntry = """
            \(macrosFragment)
            query GetDiaryEntry($id: Int!) {
              food_diary_diary_entry_by_pk(id: $id) { \(entryFields) }
            }
            """

        static let getWeeklyStats = """
            query GetWeeklyStats($currentWeekStart: timestamptz!, $todayStart: timestamptz!, $fourWeeksAgoStart: timestamptz!) {
              current_week: food_diary_diary_entry_aggregate(
                where: { consumed_at: { _gte: $currentWeekStart, _lt: $todayStart } }
              ) { aggregate { sum { calories } } }
              past_four_weeks: food_diary_diary_entry_aggregate(
                where: { consumed_at: { _gte: $fourWeeksAgoStart, _lt: $todayStart } }
              ) { aggregate { sum { calories } } }
            }
            """

        static let createDiaryEntry = """
            mutation CreateDiaryEntry($entry: food_diary_diary_entry_insert_input!) {
              insert_food_diary_diary_entry_one(object: $entry) { id }
            }
            """

        static let updateDiaryEntry = """
            mutation UpdateDiaryEntry($id: Int!, $attrs: food_diary_diary_entry_set_input!) {
              update_food_diary_diary_entry_by_pk(pk_columns: { id: $id }, _set: $attrs) { id }
            }
            """

        static let deleteDiaryEntry = """
            mutation DeleteEntry($id: Int!) {
              delete_food_diary_diary_entry_by_pk(id: $id) { id }
            }
            """

        struct EntriesResponse: Decodable {
            var foodDiaryDiaryEntry: [DiaryEntry]
        }

        struct SingleEntryResponse: Decodable {
            var foodDiaryDiaryEntryByPk: DiaryEntry
        }

        struct WeeklyStatsResponse: Decodable {
            struct Sum: Decodable { var calories: Double? }
            struct Aggregate: Decodable { var sum: Sum }
            struct Bucket: Decodable { var aggregate: Aggregate }
            var currentWeek: Bucket
            var pastFourWeeks: Bucket
        }

        struct CreateEntryResponse: Decodable {
            struct Row: Decodable { var id: Int }
            var insertFoodDiaryDiaryEntryOne: Row
        }

        struct UpdateEntryResponse: Decodable {
            struct Row: Decodable { var id: Int }
            var updateFoodDiaryDiaryEntryByPk: Row
        }

        struct ItemEntryInput: Encodable {
            var servings: Double
            var nutritionItemId: Int
            var consumedAt: String?

            init(servings: Double, nutritionItemId: Int, consumedAt: String? = nil) {
                self.servings = servings
                self.nutritionItemId = nutritionItemId
                self.consumedAt = consumedAt
            }
        }

        struct RecipeEntryInput: Encodable {
            var servings: Double
            var recipeId: Int
            var consumedAt: String?

            init(servings: Double, recipeId: Int, consumedAt: String? = nil) {
                self.servings = servings
                self.recipeId = recipeId
                self.consumedAt = consumedAt
            }
        }
    }

    enum Search {
        static let itemsAndRecipes = """
            query SearchItemsAndRecipes($search: String!) {
              food_diary_search_nutrition_items(args: { search: $search }) { id, description }
              food_diary_search_recipes(args: { search: $search }) { id, name }
            }
            """

        static let itemsOnly = """
            query SearchItems($search: String!) {
              food_diary_search_nutrition_items(args: { search: $search }) { id, description }
            }
            """

        struct ItemRow: Decodable { var id: Int; var description: String }
        struct RecipeRow: Decodable { var id: Int; var name: String }

        struct ItemsAndRecipesResponse: Decodable {
            var foodDiarySearchNutritionItems: [ItemRow]
            var foodDiarySearchRecipes: [RecipeRow]
        }

        struct ItemsOnlyResponse: Decodable {
            var foodDiarySearchNutritionItems: [ItemRow]
        }
    }

    enum Suggestions {
        struct EntryRow: Decodable {
            struct Item: Decodable { var id: Int; var description: String }
            struct Recipe: Decodable { var id: Int; var name: String }
            var consumedAt: Date
            var nutritionItem: Item?
            var recipe: Recipe?
        }

        static let recent = """
            query GetRecentEntryItems {
              food_diary_diary_entry_recent(order_by: { consumed_at: desc }, limit: 5) {
                consumed_at
                nutrition_item { id, description }
                recipe { id, name }
              }
            }
            """

        static let topAroundHour = """
            query TopEntriesAroundHour($startHour: Int!, $endHour: Int!) {
              food_diary_top_entries_around_hour(args: { start_hour: $startHour, end_hour: $endHour, n: 5 }) {
                consumed_at
                nutrition_item { id, description }
                recipe { id, name }
              }
            }
            """

        static let topLogged = """
            query GetTopLoggedItems {
              food_diary_diary_entry(order_by: { consumed_at: desc }, limit: 100) {
                consumed_at
                nutrition_item { id, description }
                recipe { id, name }
              }
            }
            """

        struct RecentEntriesResponse: Decodable { var foodDiaryDiaryEntryRecent: [EntryRow] }
        struct TopEntriesAroundHourResponse: Decodable { var foodDiaryTopEntriesAroundHour: [EntryRow] }
        struct TopLoggedResponse: Decodable { var foodDiaryDiaryEntry: [EntryRow] }
    }

    enum Items {
        static let itemFields = """
            id, description, calories,
            total_fat_grams, saturated_fat_grams, trans_fat_grams,
            polyunsaturated_fat_grams, monounsaturated_fat_grams,
            cholesterol_milligrams, sodium_milligrams, total_carbohydrate_grams,
            dietary_fiber_grams, total_sugars_grams, added_sugars_grams, protein_grams
            """

        static let getById = """
            query GetNutritionItem($id: Int!) {
              food_diary_nutrition_item_by_pk(id: $id) { \(itemFields) }
            }
            """

        static let create = """
            mutation CreateNutritionItem($nutritionItem: food_diary_nutrition_item_insert_input!) {
              insert_food_diary_nutrition_item_one(object: $nutritionItem) { id }
            }
            """

        static let update = """
            mutation UpdateItem($id: Int!, $attrs: food_diary_nutrition_item_set_input!) {
              update_food_diary_nutrition_item_by_pk(pk_columns: { id: $id }, _set: $attrs) { id }
            }
            """

        struct GetByIdResponse: Decodable { var foodDiaryNutritionItemByPk: NutritionItem }
        struct CreateResponse: Decodable {
            struct Row: Decodable { var id: Int }
            var insertFoodDiaryNutritionItemOne: Row
        }
        struct UpdateResponse: Decodable {
            struct Row: Decodable { var id: Int }
            var updateFoodDiaryNutritionItemByPk: Row
        }
    }
}
