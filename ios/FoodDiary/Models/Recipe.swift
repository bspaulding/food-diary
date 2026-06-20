import Foundation

struct RecipeItem: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var servings: Double
    var nutritionItem: NutritionItem
}

struct Recipe: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var name: String
    var calories: Double
    var totalServings: Int
    var recipeItems: [RecipeItem]
}
