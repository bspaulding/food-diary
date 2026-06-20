import Testing
import Foundation
@testable import FoodDiary

private actor FakeTargetsRepository: TargetsRepository {
    var targetsToReturn: NutritionTargets = .default
    var targetsError: Error?
    var saveError: Error?
    private(set) var lastSaved: NutritionTargets?

    func targets() async throws -> NutritionTargets {
        if let targetsError { throw targetsError }
        return targetsToReturn
    }

    func save(_ targets: NutritionTargets) async throws {
        lastSaved = targets
        if let saveError { throw saveError }
    }

    func setTargets(_ targets: NutritionTargets) { targetsToReturn = targets }
    func setTargetsError(_ error: Error) { targetsError = error }
    func setSaveError(_ error: Error) { saveError = error }
}

private struct TestError: Error {}

@MainActor
struct TargetsViewModelTests {
    @Test func loadPopulatesFieldsFromRepository() async {
        let repo = FakeTargetsRepository()
        await repo.setTargets(NutritionTargets(
            calories: 2100, caloriesMax: 2500, proteinGrams: 140,
            dietaryFiberGrams: 30, addedSugarsGrams: 20))
        let viewModel = TargetsViewModel(targetsRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.calories == 2100)
        #expect(viewModel.caloriesMax == 2500)
        #expect(viewModel.proteinGrams == 140)
        #expect(viewModel.dietaryFiberGrams == 30)
        #expect(viewModel.addedSugarsGrams == 20)
    }

    @Test func loadDefaultsWhenNoServerRow() async {
        let repo = FakeTargetsRepository()
        let viewModel = TargetsViewModel(targetsRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.calories == NutritionTargets.default.calories)
        #expect(viewModel.caloriesMax == NutritionTargets.default.caloriesMax)
        #expect(viewModel.proteinGrams == NutritionTargets.default.proteinGrams)
        #expect(viewModel.dietaryFiberGrams == NutritionTargets.default.dietaryFiberGrams)
        #expect(viewModel.addedSugarsGrams == NutritionTargets.default.addedSugarsGrams)
    }

    @Test func loadFailureSetsErrorState() async {
        let repo = FakeTargetsRepository()
        await repo.setTargetsError(TestError())
        let viewModel = TargetsViewModel(targetsRepository: repo)

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }

    @Test func saveSendsEditedFieldsAndMarksSaved() async {
        let repo = FakeTargetsRepository()
        let viewModel = TargetsViewModel(targetsRepository: repo)
        await viewModel.load()
        viewModel.calories = 1800
        viewModel.caloriesMax = 2200
        viewModel.proteinGrams = 150
        viewModel.dietaryFiberGrams = 28
        viewModel.addedSugarsGrams = 15

        await viewModel.save()

        let lastSaved = await repo.lastSaved
        #expect(lastSaved?.calories == 1800)
        #expect(lastSaved?.caloriesMax == 2200)
        #expect(lastSaved?.proteinGrams == 150)
        #expect(lastSaved?.dietaryFiberGrams == 28)
        #expect(lastSaved?.addedSugarsGrams == 15)
        #expect(viewModel.didSave)
    }

    @Test func saveFailureSetsErrorStateAndDoesNotMarkSaved() async {
        let repo = FakeTargetsRepository()
        await repo.setSaveError(TestError())
        let viewModel = TargetsViewModel(targetsRepository: repo)
        await viewModel.load()

        await viewModel.save()

        #expect(viewModel.state == .error(""))
        #expect(!viewModel.didSave)
    }
}
