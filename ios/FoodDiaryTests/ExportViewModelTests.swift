import Testing
import Foundation
@testable import FoodDiary

private actor FakeExportRepository: ExportRepository {
    var entriesToReturn: [ExportEntry] = []
    var error: Error?
    private(set) var lastFrom: Date?
    private(set) var lastTo: Date?

    func entries(from: Date?, to: Date?) async throws -> [ExportEntry] {
        lastFrom = from
        lastTo = to
        if let error { throw error }
        return entriesToReturn
    }

    func setEntries(_ entries: [ExportEntry]) { entriesToReturn = entries }
    func setError(_ error: Error) { self.error = error }
}

private struct TestError: Error {}

@MainActor
struct ExportViewModelTests {
    @Test func exportProducesCsvFromRepositoryEntries() async {
        let repo = FakeExportRepository()
        let item = ExportNutritionItem(
            description: "Oats", calories: 160, totalFatGrams: 2, saturatedFatGrams: 0,
            transFatGrams: 0, polyunsaturatedFatGrams: 0.5, monounsaturatedFatGrams: 1,
            cholesterolMilligrams: 0, sodiumMilligrams: 190, totalCarbohydrateGrams: 34,
            dietaryFiberGrams: 2, totalSugarsGrams: 9, addedSugarsGrams: 8, proteinGrams: 3)
        await repo.setEntries([
            ExportEntry(servings: 1, consumedAt: Date(), nutritionItem: item, recipe: nil)
        ])
        let viewModel = ExportViewModel(exportRepository: repo)

        await viewModel.export()

        #expect(viewModel.csv != nil)
        #expect(viewModel.csv?.contains("Oats") == true)
        #expect(viewModel.errorMessage == nil)
    }

    @Test func exportSurfacesRepositoryError() async {
        let repo = FakeExportRepository()
        await repo.setError(TestError())
        let viewModel = ExportViewModel(exportRepository: repo)

        await viewModel.export()

        #expect(viewModel.csv == nil)
        #expect(viewModel.errorMessage != nil)
    }

    @Test func exportPassesDateRangeToRepository() async {
        let repo = FakeExportRepository()
        let viewModel = ExportViewModel(exportRepository: repo)
        let start = Date(timeIntervalSince1970: 0)
        let end = Date(timeIntervalSince1970: 1000)
        viewModel.startDate = start
        viewModel.endDate = end
        viewModel.useDateRange = true

        await viewModel.export()

        let lastFrom = await repo.lastFrom
        let lastTo = await repo.lastTo
        #expect(lastFrom == start)
        #expect(lastTo == end)
    }
}
