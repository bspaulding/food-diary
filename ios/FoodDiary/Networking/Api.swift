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
}
