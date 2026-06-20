import Testing
import Foundation
@testable import FoodDiary

private actor FakeRecipeRepository: RecipeRepository {
    var recipeToReturn: Recipe?
    var recipeError: Error?
    var createError: Error?
    var updateError: Error?
    private(set) var lastCreate: (name: String, totalServings: Int, items: [RecipeItemDraft])?
    private(set) var lastUpdate: (id: Int, name: String, totalServings: Int, items: [RecipeItemDraft])?

    func recipe(id: Int) async throws -> Recipe {
        if let recipeError { throw recipeError }
        return recipeToReturn!
    }

    func create(name: String, totalServings: Int, items: [RecipeItemDraft]) async throws -> Int {
        lastCreate = (name, totalServings, items)
        if let createError { throw createError }
        return 42
    }

    func update(id: Int, name: String, totalServings: Int, items: [RecipeItemDraft]) async throws {
        lastUpdate = (id, name, totalServings, items)
        if let updateError { throw updateError }
    }

    func setRecipe(_ recipe: Recipe) { recipeToReturn = recipe }
    func setRecipeError(_ error: Error) { recipeError = error }
    func setCreateError(_ error: Error) { createError = error }
    func setUpdateError(_ error: Error) { updateError = error }
}

private actor FakeSearchRepository: SearchRepository {
    var itemsToReturn: [SearchResult] = []
    var itemsAndRecipesToReturn: [SearchResult] = []

    func searchItemsAndRecipes(_ query: String) async throws -> [SearchResult] { itemsAndRecipesToReturn }
    func searchItems(_ query: String) async throws -> [SearchResult] { itemsToReturn }

    func setItemsToReturn(_ results: [SearchResult]) { itemsToReturn = results }
}

private struct TestError: Error {}

private func makeRecipe(id: Int = 1) -> Recipe {
    Recipe(
        id: id, name: "Soup", totalServings: 4,
        recipeItems: [
            RecipeItem(servings: 2, nutritionItem: RecipeItemSummary(id: 10, description: "Carrot", calories: 25)),
            RecipeItem(servings: 1, nutritionItem: RecipeItemSummary(id: 11, description: "Broth", calories: 15)),
        ])
}

@MainActor
struct RecipeFormViewModelTests {
    @Test func newFormStartsWithDefaultsAndLoadedState() async {
        let recipes = FakeRecipeRepository()
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: nil, recipeRepository: recipes, searchRepository: search)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.name == "")
        #expect(viewModel.totalServings == 1)
        #expect(viewModel.items.isEmpty)
    }

    @Test func editFormLoadsExistingRecipeIntoFields() async {
        let recipes = FakeRecipeRepository()
        await recipes.setRecipe(makeRecipe())
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: 1, recipeRepository: recipes, searchRepository: search)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.name == "Soup")
        #expect(viewModel.totalServings == 4)
        #expect(viewModel.items.count == 2)
        #expect(viewModel.items[0].name == "Carrot")
        #expect(viewModel.items[0].servings == 2)
        #expect(viewModel.items[0].nutritionItemID == 10)
    }

    @Test func editFormLoadFailureSetsErrorState() async {
        let recipes = FakeRecipeRepository()
        await recipes.setRecipeError(TestError())
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: 1, recipeRepository: recipes, searchRepository: search)

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }

    @Test func searchPopulatesResultsAndIsEmptyForEmptyQuery() async {
        let recipes = FakeRecipeRepository()
        let search = FakeSearchRepository()
        await search.setItemsToReturn([SearchResult(id: 5, kind: .item, name: "Apple")])
        let viewModel = RecipeFormViewModel(recipeID: nil, recipeRepository: recipes, searchRepository: search)
        await viewModel.load()

        viewModel.searchQuery = "app"
        await viewModel.search()
        #expect(viewModel.searchResults.map(\.name) == ["Apple"])

        viewModel.searchQuery = ""
        await viewModel.search()
        #expect(viewModel.searchResults.isEmpty)
    }

    @Test func addItemAppendsWithDefaultServingsAndClearsSearch() async {
        let recipes = FakeRecipeRepository()
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: nil, recipeRepository: recipes, searchRepository: search)
        await viewModel.load()
        await search.setItemsToReturn([SearchResult(id: 5, kind: .item, name: "Apple")])
        viewModel.searchQuery = "app"
        await viewModel.search()

        viewModel.addItem(SearchResult(id: 5, kind: .item, name: "Apple"))

        #expect(viewModel.items.count == 1)
        #expect(viewModel.items[0].nutritionItemID == 5)
        #expect(viewModel.items[0].name == "Apple")
        #expect(viewModel.items[0].servings == 1)
        #expect(viewModel.searchQuery == "")
        #expect(viewModel.searchResults.isEmpty)
    }

    @Test func removeItemDeletesByOffset() async {
        let recipes = FakeRecipeRepository()
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: nil, recipeRepository: recipes, searchRepository: search)
        await viewModel.load()
        viewModel.addItem(SearchResult(id: 5, kind: .item, name: "Apple"))
        viewModel.addItem(SearchResult(id: 6, kind: .item, name: "Banana"))

        viewModel.removeItem(at: IndexSet(integer: 0))

        #expect(viewModel.items.count == 1)
        #expect(viewModel.items[0].name == "Banana")
    }

    @Test func saveNewRecipeCreatesWithNameServingsAndItems() async {
        let recipes = FakeRecipeRepository()
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: nil, recipeRepository: recipes, searchRepository: search)
        await viewModel.load()
        viewModel.name = "Stew"
        viewModel.totalServings = 6
        viewModel.addItem(SearchResult(id: 7, kind: .item, name: "Potato"))
        viewModel.setServings(3, forItemAt: 0)

        await viewModel.save()

        let lastCreate = await recipes.lastCreate
        #expect(lastCreate?.name == "Stew")
        #expect(lastCreate?.totalServings == 6)
        #expect(lastCreate?.items == [RecipeItemDraft(nutritionItemID: 7, servings: 3)])
        #expect(viewModel.didSave)
    }

    @Test func saveExistingRecipeUpdatesWithNameServingsAndItems() async {
        let recipes = FakeRecipeRepository()
        await recipes.setRecipe(makeRecipe())
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: 1, recipeRepository: recipes, searchRepository: search)
        await viewModel.load()
        viewModel.totalServings = 8

        await viewModel.save()

        let lastUpdate = await recipes.lastUpdate
        #expect(lastUpdate?.id == 1)
        #expect(lastUpdate?.name == "Soup")
        #expect(lastUpdate?.totalServings == 8)
        #expect(lastUpdate?.items == [
            RecipeItemDraft(nutritionItemID: 10, servings: 2),
            RecipeItemDraft(nutritionItemID: 11, servings: 1),
        ])
        #expect(viewModel.didSave)
    }

    @Test func saveFailureSetsErrorStateAndDoesNotMarkSaved() async {
        let recipes = FakeRecipeRepository()
        await recipes.setCreateError(TestError())
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: nil, recipeRepository: recipes, searchRepository: search)
        await viewModel.load()
        viewModel.name = "Bad"

        await viewModel.save()

        #expect(viewModel.state == .error(""))
        #expect(!viewModel.didSave)
    }

    @Test func updateFailureSetsErrorStateAndDoesNotMarkSaved() async {
        let recipes = FakeRecipeRepository()
        await recipes.setRecipe(makeRecipe())
        await recipes.setUpdateError(TestError())
        let search = FakeSearchRepository()
        let viewModel = RecipeFormViewModel(recipeID: 1, recipeRepository: recipes, searchRepository: search)
        await viewModel.load()

        await viewModel.save()

        #expect(viewModel.state == .error(""))
        #expect(!viewModel.didSave)
    }
}
