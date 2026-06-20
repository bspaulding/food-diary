import Testing
import Foundation
@testable import FoodDiary

private actor FakeNutritionItemRepository: NutritionItemRepository {
    var itemToReturn: NutritionItem?
    var itemError: Error?
    var createError: Error?
    var updateError: Error?
    private(set) var lastCreateInput: NutritionItemInput?
    private(set) var lastUpdate: (id: Int, input: NutritionItemInput)?

    func item(id: Int) async throws -> NutritionItem {
        if let itemError { throw itemError }
        return itemToReturn!
    }

    func create(_ input: NutritionItemInput) async throws -> Int {
        lastCreateInput = input
        if let createError { throw createError }
        return 99
    }

    func update(id: Int, _ input: NutritionItemInput) async throws {
        lastUpdate = (id, input)
        if let updateError { throw updateError }
    }

    func setItem(_ item: NutritionItem) { itemToReturn = item }
    func setItemError(_ error: Error) { itemError = error }
    func setCreateError(_ error: Error) { createError = error }
    func setUpdateError(_ error: Error) { updateError = error }
}

private struct TestError: Error {}

private func makeItem(id: Int = 1) -> NutritionItem {
    NutritionItem(
        id: id, description: "Apple", calories: 95,
        totalFatGrams: 0.3, saturatedFatGrams: 0.1, transFatGrams: 0, polyunsaturatedFatGrams: 0.1,
        monounsaturatedFatGrams: 0.1, cholesterolMilligrams: 0, sodiumMilligrams: 2,
        totalCarbohydrateGrams: 25, dietaryFiberGrams: 4.4, totalSugarsGrams: 19,
        addedSugarsGrams: 0, proteinGrams: 0.5)
}

@MainActor
struct ItemFormViewModelTests {
    @Test func newFormStartsWithZeroedFieldsAndLoadedState() async {
        let repo = FakeNutritionItemRepository()
        let viewModel = ItemFormViewModel(itemID: nil, itemRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.description == "")
        #expect(viewModel.calories == 0)
        #expect(viewModel.proteinGrams == 0)
    }

    @Test func editFormLoadsExistingItemIntoFields() async {
        let repo = FakeNutritionItemRepository()
        await repo.setItem(makeItem())
        let viewModel = ItemFormViewModel(itemID: 1, itemRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.description == "Apple")
        #expect(viewModel.calories == 95)
        #expect(viewModel.dietaryFiberGrams == 4.4)
        #expect(viewModel.proteinGrams == 0.5)
    }

    @Test func editFormLoadFailureSetsErrorState() async {
        let repo = FakeNutritionItemRepository()
        await repo.setItemError(TestError())
        let viewModel = ItemFormViewModel(itemID: 1, itemRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }

    @Test func saveNewItemCreatesWithEncodedFields() async {
        let repo = FakeNutritionItemRepository()
        let viewModel = ItemFormViewModel(itemID: nil, itemRepository: repo)
        await viewModel.load()
        viewModel.description = "Banana"
        viewModel.calories = 105
        viewModel.proteinGrams = 1.3

        await viewModel.save()

        let lastCreateInput = await repo.lastCreateInput
        #expect(lastCreateInput?.description == "Banana")
        #expect(lastCreateInput?.calories == 105)
        #expect(lastCreateInput?.proteinGrams == 1.3)
        #expect(viewModel.didSave)
    }

    @Test func saveExistingItemUpdatesWithEncodedFields() async {
        let repo = FakeNutritionItemRepository()
        await repo.setItem(makeItem())
        let viewModel = ItemFormViewModel(itemID: 1, itemRepository: repo)
        await viewModel.load()
        viewModel.calories = 120

        await viewModel.save()

        let lastUpdate = await repo.lastUpdate
        #expect(lastUpdate?.id == 1)
        #expect(lastUpdate?.input.calories == 120)
        #expect(lastUpdate?.input.description == "Apple")
        #expect(viewModel.didSave)
    }

    @Test func saveFailureSetsErrorStateAndDoesNotMarkSaved() async {
        let repo = FakeNutritionItemRepository()
        await repo.setCreateError(TestError())
        let viewModel = ItemFormViewModel(itemID: nil, itemRepository: repo)
        await viewModel.load()
        viewModel.description = "Bread"

        await viewModel.save()

        #expect(viewModel.state == .error(""))
        #expect(!viewModel.didSave)
    }

    @Test func updateFailureSetsErrorStateAndDoesNotMarkSaved() async {
        let repo = FakeNutritionItemRepository()
        await repo.setItem(makeItem())
        await repo.setUpdateError(TestError())
        let viewModel = ItemFormViewModel(itemID: 1, itemRepository: repo)
        await viewModel.load()

        await viewModel.save()

        #expect(viewModel.state == .error(""))
        #expect(!viewModel.didSave)
    }
}
