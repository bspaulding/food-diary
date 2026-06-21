import Foundation

/// The full 14-field nutrition item shape embedded in `ExportEntries`/
/// `ExportEntriesWithDateRange` responses (web's `nutritionItem` fragment in
/// `web/src/Api.ts`) — distinct from `NutritionItem` because export rows never
/// carry an `id`.
struct ExportNutritionItem: Codable, Hashable, Sendable {
    var description: String
    var calories: Double
    var totalFatGrams: Double
    var saturatedFatGrams: Double
    var transFatGrams: Double
    var polyunsaturatedFatGrams: Double
    var monounsaturatedFatGrams: Double
    var cholesterolMilligrams: Double
    var sodiumMilligrams: Double
    var totalCarbohydrateGrams: Double
    var dietaryFiberGrams: Double
    var totalSugarsGrams: Double
    var addedSugarsGrams: Double
    var proteinGrams: Double
}

struct ExportRecipeItem: Codable, Hashable, Sendable {
    var servings: Double
    var nutritionItem: ExportNutritionItem
}

struct ExportRecipe: Codable, Hashable, Sendable {
    var name: String
    var recipeItems: [ExportRecipeItem]
}

/// One row of `food_diary_diary_entry` as selected by `ExportEntries`/
/// `ExportEntriesWithDateRange` (web `entryFields` in `web/src/Api.ts`):
/// `nutrition_item` xor `recipe`, mirroring `DiaryEntry`.
struct ExportEntry: Codable, Hashable, Sendable {
    var servings: Double
    var consumedAt: Date
    var nutritionItem: ExportNutritionItem?
    var recipe: ExportRecipe?
}
