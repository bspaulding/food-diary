import Testing
import Foundation
@testable import FoodDiary

private actor FakeImportRepository: ImportRepository {
    var error: Error?
    private(set) var lastEntries: [CSV.ImportedEntry] = []
    private(set) var insertedCount = 0

    func insertEntries(_ entries: [CSV.ImportedEntry]) async throws -> Int {
        lastEntries = entries
        if let error { throw error }
        insertedCount = entries.count
        return entries.count
    }

    func setError(_ error: Error) { self.error = error }
}

private struct TestError: Error {}

private let validCsv = """
    Date,Time,Consumed At,Description,Servings,Calories,Total Fat (g),Saturated Fat (g),Trans Fat (g),Polyunsaturated Fat (g),Monounsaturated Fat (g),Cholesterol (mg),Sodium (mg),Total Carbohydrate (g),Dietary Fiber (g),Total Sugars (g),Added Sugars (g),Protein (g)
    2022-08-28,7:30 AM,2022-08-28T07:30:00-07:00,Honey Bunches of Oats,1,160,2,0,0,0.5,1,0,190,34,2,9,8,3
    """

@MainActor
struct ImportViewModelTests {
    @Test func loadCsvPopulatesPreviewRows() {
        let repo = FakeImportRepository()
        let viewModel = ImportViewModel(importRepository: repo)

        viewModel.loadCsv(validCsv)

        #expect(viewModel.previewRows.count == 1)
        #expect(viewModel.parseErrors.isEmpty)
    }

    @Test func loadCsvCollectsParseErrorsForInvalidRows() {
        let repo = FakeImportRepository()
        let viewModel = ImportViewModel(importRepository: repo)
        let csv = "Consumed At,Description,Servings\ninvalid-date,Mystery,1"

        viewModel.loadCsv(csv)

        #expect(viewModel.previewRows.isEmpty)
        #expect(viewModel.parseErrors.count == 1)
    }

    @Test func confirmInsertsPreviewedEntries() async {
        let repo = FakeImportRepository()
        let viewModel = ImportViewModel(importRepository: repo)
        viewModel.loadCsv(validCsv)

        await viewModel.confirm()

        #expect(viewModel.didImport)
        let inserted = await repo.insertedCount
        #expect(inserted == 1)
    }

    @Test func confirmSurfacesRepositoryError() async {
        let repo = FakeImportRepository()
        await repo.setError(TestError())
        let viewModel = ImportViewModel(importRepository: repo)
        viewModel.loadCsv(validCsv)

        await viewModel.confirm()

        #expect(!viewModel.didImport)
        #expect(viewModel.errorMessage != nil)
    }
}
