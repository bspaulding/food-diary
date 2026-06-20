import Foundation

/// `nutritionItem` xor `recipe` — the DB `CHECK (has_recipe_xor_item)` guarantees
/// exactly one is present; decoding simply tolerates either being nil.
struct DiaryEntry: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var consumedAt: Date
    var calories: Double
    var servings: Double
    var nutritionItem: NutritionItem?
    var recipe: Recipe?
}
