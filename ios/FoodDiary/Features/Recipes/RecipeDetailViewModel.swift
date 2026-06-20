import Foundation

/// Port of `web/src/RecipeShow.tsx` (PRD §4.5): load a recipe and compute its
/// total calories and calories-per-serving.
@MainActor @Observable
final class RecipeDetailViewModel {
    enum State: Equatable {
        case loading, loaded, error(String)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    let recipeID: Int
    private let recipeRepository: RecipeRepository

    private(set) var state: State = .loading
    private(set) var recipe: Recipe?

    init(recipeID: Int, recipeRepository: RecipeRepository) {
        self.recipeID = recipeID
        self.recipeRepository = recipeRepository
    }

    func load() async {
        state = .loading
        do {
            recipe = try await recipeRepository.recipe(id: recipeID)
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }

    /// `web/src/RecipeShow.tsx calculateItemCalories`: `servings * nutritionItem.calories`.
    func calories(for item: RecipeItem) -> Double {
        item.servings * item.nutritionItem.calories
    }

    /// `web/src/RecipeShow.tsx totalCalories`.
    var totalCalories: Double {
        guard let recipe else { return 0 }
        return recipe.recipeItems.reduce(0) { $0 + calories(for: $1) }
    }

    /// `web/src/RecipeShow.tsx caloriesPerServing`: total servings <= 0 treated as 1.
    var caloriesPerServing: Double {
        guard let recipe else { return 0 }
        let servings = recipe.totalServings > 0 ? Double(recipe.totalServings) : 1
        return totalCalories / servings
    }
}
