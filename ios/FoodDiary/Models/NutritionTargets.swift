import Foundation

struct NutritionTargets: Codable, Hashable, Sendable {
    var calories: Double
    var caloriesMax: Double
    var proteinGrams: Double
    var dietaryFiberGrams: Double
    var addedSugarsGrams: Double

    static let `default` = NutritionTargets(
        calories: 2000, caloriesMax: 2400, proteinGrams: 130,
        dietaryFiberGrams: 25, addedSugarsGrams: 25)
}
