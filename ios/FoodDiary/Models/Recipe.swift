import Foundation

/// The fields `GetRecipe` selects for a constituent item — id/description/
/// calories only, never the full 14-field `NutritionItem` (web
/// `fetchRecipeQuery`).
struct RecipeItemSummary: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var description: String
    var calories: Double
}

struct RecipeItem: Codable, Hashable, Sendable {
    var servings: Double
    var nutritionItem: RecipeItemSummary
}

/// `GetRecipe` does not select a top-level `calories` column (unlike the
/// diary-entry-embedded `EntryRecipe`, which uses a generated column) — the
/// client computes a display total from `recipeItems` (PRD §4.5).
struct Recipe: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var name: String
    var totalServings: Int
    var recipeItems: [RecipeItem]
}
