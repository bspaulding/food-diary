import Testing
import Foundation
@testable import FoodDiary

private actor FakeNutritionItemRepository: NutritionItemRepository {
    var itemToReturn: NutritionItem?
    var itemError: Error?

    func item(id: Int) async throws -> NutritionItem {
        if let itemError { throw itemError }
        return itemToReturn!
    }

    func create(_ input: NutritionItemInput) async throws -> Int { 0 }
    func update(id: Int, _ input: NutritionItemInput) async throws {}

    func setItem(_ item: NutritionItem) { itemToReturn = item }
    func setItemError(_ error: Error) { itemError = error }
}

private struct TestError: Error {}

@MainActor
struct ItemDetailViewModelTests {
    @Test func loadPopulatesItemAndLoadedState() async {
        let repo = FakeNutritionItemRepository()
        let item = NutritionItem(
            id: 1, description: "Apple", calories: 95,
            totalFatGrams: 0.3, saturatedFatGrams: 0.1, transFatGrams: 0, polyunsaturatedFatGrams: 0.1,
            monounsaturatedFatGrams: 0.1, cholesterolMilligrams: 0, sodiumMilligrams: 2,
            totalCarbohydrateGrams: 25, dietaryFiberGrams: 4.4, totalSugarsGrams: 19,
            addedSugarsGrams: 0, proteinGrams: 0.5)
        await repo.setItem(item)
        let viewModel = ItemDetailViewModel(itemID: 1, itemRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.item?.description == "Apple")
        #expect(viewModel.item?.calories == 95)
    }

    @Test func loadFailureSetsErrorState() async {
        let repo = FakeNutritionItemRepository()
        await repo.setItemError(TestError())
        let viewModel = ItemDetailViewModel(itemID: 1, itemRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }
}
