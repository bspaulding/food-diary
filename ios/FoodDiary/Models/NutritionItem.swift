import Foundation

struct NutritionItem: Codable, Identifiable, Hashable, Sendable {
    let id: Int
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
