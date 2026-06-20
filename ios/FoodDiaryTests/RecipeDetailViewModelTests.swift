import Testing
import Foundation
@testable import FoodDiary

private actor FakeRecipeRepository: RecipeRepository {
    var recipeToReturn: Recipe?
    var recipeError: Error?

    func recipe(id: Int) async throws -> Recipe {
        if let recipeError { throw recipeError }
        return recipeToReturn!
    }

    func create(name: String, totalServings: Int, items: [RecipeItemDraft]) async throws -> Int { 0 }
    func update(id: Int, name: String, totalServings: Int, items: [RecipeItemDraft]) async throws {}

    func setRecipe(_ recipe: Recipe) { recipeToReturn = recipe }
    func setRecipeError(_ error: Error) { recipeError = error }
}

private struct TestError: Error {}

private func makeRecipe(id: Int = 1, totalServings: Int = 4) -> Recipe {
    Recipe(
        id: id, name: "Soup", totalServings: totalServings,
        recipeItems: [
            RecipeItem(servings: 2, nutritionItem: RecipeItemSummary(id: 10, description: "Carrot", calories: 25)),
            RecipeItem(servings: 1, nutritionItem: RecipeItemSummary(id: 11, description: "Broth", calories: 15)),
        ])
}

@MainActor
struct RecipeDetailViewModelTests {
    @Test func loadPopulatesRecipeAndLoadedState() async {
        let repo = FakeRecipeRepository()
        await repo.setRecipe(makeRecipe())
        let viewModel = RecipeDetailViewModel(recipeID: 1, recipeRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.recipe?.name == "Soup")
    }

    @Test func loadFailureSetsErrorState() async {
        let repo = FakeRecipeRepository()
        await repo.setRecipeError(TestError())
        let viewModel = RecipeDetailViewModel(recipeID: 1, recipeRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }

    @Test func totalCaloriesSumsServingsTimesItemCalories() async {
        let repo = FakeRecipeRepository()
        await repo.setRecipe(makeRecipe())
        let viewModel = RecipeDetailViewModel(recipeID: 1, recipeRepository: repo)
        await viewModel.load()

        // 2 * 25 + 1 * 15 = 65
        #expect(viewModel.totalCalories == 65)
    }

    @Test func caloriesPerServingDividesByTotalServings() async {
        let repo = FakeRecipeRepository()
        await repo.setRecipe(makeRecipe(totalServings: 4))
        let viewModel = RecipeDetailViewModel(recipeID: 1, recipeRepository: repo)
        await viewModel.load()

        // 65 / 4 = 16.25
        #expect(viewModel.caloriesPerServing == 16.25)
    }

    @Test func caloriesPerServingTreatsZeroOrNegativeTotalServingsAsOne() async {
        let repo = FakeRecipeRepository()
        await repo.setRecipe(makeRecipe(totalServings: 0))
        let viewModel = RecipeDetailViewModel(recipeID: 1, recipeRepository: repo)
        await viewModel.load()

        #expect(viewModel.caloriesPerServing == 65)
    }

    @Test func totalCaloriesIsZeroWhenNotLoaded() async {
        let repo = FakeRecipeRepository()
        let viewModel = RecipeDetailViewModel(recipeID: 1, recipeRepository: repo)

        #expect(viewModel.totalCalories == 0)
        #expect(viewModel.caloriesPerServing == 0)
    }
}
