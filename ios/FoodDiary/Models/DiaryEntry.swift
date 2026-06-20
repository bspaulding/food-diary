import Foundation

/// The macro subset Hasura returns for nutrition items embedded in a diary
/// entry's `recipe.recipe_items` — the GraphQL selection only requests the
/// three macros used by the rings, never the full 14-field nutrition item.
struct EntryMacros: Codable, Hashable, Sendable {
    var addedSugarsGrams: Double
    var proteinGrams: Double
    var dietaryFiberGrams: Double
}

/// The fields `GetEntries`/`GetDiaryEntry` select for a directly-logged item
/// (id/description/calories plus the same macro subset as `EntryMacros`) —
/// distinct from the full `NutritionItem` used by the Items CRUD screens.
struct EntryNutritionItem: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var description: String
    var calories: Double
    var addedSugarsGrams: Double
    var proteinGrams: Double
    var dietaryFiberGrams: Double
}

struct EntryRecipeItem: Codable, Hashable, Sendable {
    var servings: Double
    var nutritionItem: EntryMacros
}

struct EntryRecipe: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var name: String
    var calories: Double
    var totalServings: Int
    var recipeItems: [EntryRecipeItem]
}

/// `nutritionItem` xor `recipe` — the DB `CHECK (has_recipe_xor_item)` guarantees
/// exactly one is present; decoding simply tolerates either being nil.
struct DiaryEntry: Codable, Identifiable, Hashable, Sendable {
    let id: Int
    var consumedAt: Date
    var calories: Double
    var servings: Double
    var nutritionItem: EntryNutritionItem?
    var recipe: EntryRecipe?
}
