import Foundation

/// Create payload for `food_diary_nutrition_item` — same fields as
/// `NutritionItem` minus `id` (server-assigned). Mirrors web's
/// `NutritionItemAttrs` (`web/src/Api.ts`).
struct NutritionItemInput: Encodable, Sendable {
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

extension NutritionItemInput {
    init(_ item: NutritionItem) {
        self.init(
            description: item.description, calories: item.calories,
            totalFatGrams: item.totalFatGrams, saturatedFatGrams: item.saturatedFatGrams,
            transFatGrams: item.transFatGrams, polyunsaturatedFatGrams: item.polyunsaturatedFatGrams,
            monounsaturatedFatGrams: item.monounsaturatedFatGrams, cholesterolMilligrams: item.cholesterolMilligrams,
            sodiumMilligrams: item.sodiumMilligrams, totalCarbohydrateGrams: item.totalCarbohydrateGrams,
            dietaryFiberGrams: item.dietaryFiberGrams, totalSugarsGrams: item.totalSugarsGrams,
            addedSugarsGrams: item.addedSugarsGrams, proteinGrams: item.proteinGrams)
    }
}
