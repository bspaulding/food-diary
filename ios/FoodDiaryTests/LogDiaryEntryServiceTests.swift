import Testing
import Foundation
@testable import FoodDiary

/// Covers the data-orchestration logic behind the "Log <item>" App Intent
/// (Phase 5 Widgets/Shortcuts, PRD §5): resolve a free-text query to a
/// `SearchResult` via `SearchRepository`, then create a diary entry via
/// `DiaryRepository`. The `AppIntent` itself is a thin wrapper (per this
/// codebase's convention, plain glue isn't unit-tested) — this service is
/// the testable seam.

private actor FakeSearchRepository: SearchRepository {
    var resultsToReturn: [SearchResult] = []
    private(set) var lastQuery: String?

    func searchItemsAndRecipes(_ query: String) async throws -> [SearchResult] {
        lastQuery = query
        return resultsToReturn
    }

    func searchItems(_ query: String) async throws -> [SearchResult] { resultsToReturn }

    func setResults(_ results: [SearchResult]) { resultsToReturn = results }
}

private actor FakeDiaryRepository: DiaryRepository {
    var createError: Error?
    private(set) var lastCreateInput: NewDiaryEntryInput?

    func entries(from: Date, to: Date?) async throws -> [DiaryEntry] { [] }
    func weeklyStats(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) async throws -> WeeklyStatsTotals {
        WeeklyStatsTotals(currentWeekCalories: 0, pastFourWeeksCalories: 0)
    }
    func entry(id: Int) async throws -> DiaryEntry {
        DiaryEntry(id: id, consumedAt: Date(), calories: 0, servings: 1, nutritionItem: nil, recipe: nil)
    }

    func createEntry(_ input: NewDiaryEntryInput) async throws -> Int {
        lastCreateInput = input
        if let createError { throw createError }
        return 42
    }

    func updateEntry(id: Int, servings: Double, consumedAt: Date) async throws {}
    func delete(entryID: Int) async throws {}

    func setCreateError(_ error: Error) { createError = error }
}

private struct TestError: Error, Equatable {}

struct LogDiaryEntryServiceTests {
    @Test func logsAnItemMatchByExactName() async throws {
        let search = FakeSearchRepository()
        await search.setResults([
            SearchResult(id: 1, kind: .item, name: "Almonds"),
            SearchResult(id: 2, kind: .recipe, name: "Almond Soup"),
        ])
        let diary = FakeDiaryRepository()
        let service = LogDiaryEntryService(diaryRepository: diary, searchRepository: search, now: { Date(timeIntervalSince1970: 1000) })

        let result = try await service.log(query: "Almonds", servings: 2)

        #expect(result.matchedName == "Almonds")
        #expect(await search.lastQuery == "Almonds")
        let input = await diary.lastCreateInput
        #expect(input == .item(nutritionItemID: 1, servings: 2, consumedAt: Date(timeIntervalSince1970: 1000)))
    }

    @Test func logsARecipeMatch() async throws {
        let search = FakeSearchRepository()
        await search.setResults([SearchResult(id: 7, kind: .recipe, name: "Soup")])
        let diary = FakeDiaryRepository()
        let service = LogDiaryEntryService(diaryRepository: diary, searchRepository: search, now: { Date(timeIntervalSince1970: 2000) })

        let result = try await service.log(query: "Soup", servings: 1)

        #expect(result.matchedName == "Soup")
        let input = await diary.lastCreateInput
        #expect(input == .recipe(recipeID: 7, servings: 1, consumedAt: Date(timeIntervalSince1970: 2000)))
    }

    @Test func prefersCaseInsensitiveExactMatchOverFirstResult() async throws {
        let search = FakeSearchRepository()
        await search.setResults([
            SearchResult(id: 1, kind: .item, name: "Almond Butter"),
            SearchResult(id: 2, kind: .item, name: "almonds"),
        ])
        let diary = FakeDiaryRepository()
        let service = LogDiaryEntryService(diaryRepository: diary, searchRepository: search, now: Date.init)

        let result = try await service.log(query: "Almonds", servings: 1)

        #expect(result.matchedID == 2)
    }

    @Test func fallsBackToFirstResultWhenNoExactMatch() async throws {
        let search = FakeSearchRepository()
        await search.setResults([SearchResult(id: 5, kind: .item, name: "Almond Butter")])
        let diary = FakeDiaryRepository()
        let service = LogDiaryEntryService(diaryRepository: diary, searchRepository: search, now: Date.init)

        let result = try await service.log(query: "Almonds", servings: 1)

        #expect(result.matchedID == 5)
    }

    @Test func throwsNoMatchWhenSearchReturnsNoResults() async {
        let search = FakeSearchRepository()
        await search.setResults([])
        let diary = FakeDiaryRepository()
        let service = LogDiaryEntryService(diaryRepository: diary, searchRepository: search, now: Date.init)

        await #expect(throws: LogDiaryEntryService.LogError.noMatch) {
            try await service.log(query: "Nonexistent", servings: 1)
        }
    }

    @Test func propagatesCreateEntryFailure() async {
        let search = FakeSearchRepository()
        await search.setResults([SearchResult(id: 1, kind: .item, name: "Almonds")])
        let diary = FakeDiaryRepository()
        await diary.setCreateError(TestError())
        let service = LogDiaryEntryService(diaryRepository: diary, searchRepository: search, now: Date.init)

        await #expect(throws: TestError.self) {
            try await service.log(query: "Almonds", servings: 1)
        }
    }

    @Test func defaultsServingsToOneWhenNotSpecified() async throws {
        let search = FakeSearchRepository()
        await search.setResults([SearchResult(id: 1, kind: .item, name: "Almonds")])
        let diary = FakeDiaryRepository()
        let service = LogDiaryEntryService(diaryRepository: diary, searchRepository: search, now: { Date(timeIntervalSince1970: 3000) })

        _ = try await service.log(query: "Almonds", servings: nil)

        let input = await diary.lastCreateInput
        #expect(input == .item(nutritionItemID: 1, servings: 1, consumedAt: Date(timeIntervalSince1970: 3000)))
    }
}
