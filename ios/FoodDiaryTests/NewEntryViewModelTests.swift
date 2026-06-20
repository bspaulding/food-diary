import Testing
import Foundation
@testable import FoodDiary

private actor FakeSuggestionsRepository: SuggestionsRepository {
    var recentToReturn: [SuggestionEntry] = []
    var aroundHourToReturn: [SuggestionEntry] = []
    var topLoggedToReturn: [SuggestionEntry] = []
    private(set) var lastAroundHourRange: (startHour: Int, endHour: Int)?

    func recent() async throws -> [SuggestionEntry] { recentToReturn }

    func topAroundHour(startHour: Int, endHour: Int) async throws -> [SuggestionEntry] {
        lastAroundHourRange = (startHour, endHour)
        return aroundHourToReturn
    }

    func topLogged() async throws -> [SuggestionEntry] { topLoggedToReturn }

    func setRecent(_ entries: [SuggestionEntry]) { recentToReturn = entries }
    func setAroundHour(_ entries: [SuggestionEntry]) { aroundHourToReturn = entries }
    func setTopLogged(_ entries: [SuggestionEntry]) { topLoggedToReturn = entries }
}

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

private struct TestError: Error {}

@MainActor
struct NewEntryViewModelTests {
    @Test func loadSuggestionsPopulatesAllThreeSources() async {
        let suggestions = FakeSuggestionsRepository()
        await suggestions.setRecent([SuggestionEntry(kind: .item, id: 1, name: "Recent", consumedAt: Date())])
        await suggestions.setAroundHour([SuggestionEntry(kind: .item, id: 2, name: "AroundHour", consumedAt: Date())])
        await suggestions.setTopLogged([SuggestionEntry(kind: .item, id: 3, name: "TopLogged", consumedAt: Date())])
        let viewModel = NewEntryViewModel(
            diaryRepository: FakeDiaryRepository(), suggestionsRepository: suggestions, searchRepository: FakeSearchRepository())

        await viewModel.loadSuggestions()

        #expect(viewModel.recentSuggestions.map(\.id) == [1])
        #expect(viewModel.aroundHourSuggestions.map(\.id) == [2])
        #expect(viewModel.mostLoggedSuggestions.map(\.id) == [3])
        #expect(!viewModel.hasNoSuggestions)
    }

    @Test func hasNoSuggestionsWhenAllThreeAreEmpty() async {
        let viewModel = NewEntryViewModel(
            diaryRepository: FakeDiaryRepository(), suggestionsRepository: FakeSuggestionsRepository(), searchRepository: FakeSearchRepository())

        await viewModel.loadSuggestions()

        #expect(viewModel.hasNoSuggestions)
    }

    @Test func loadSuggestionsUsesOneHourMarginAroundCurrentUTCHour() async {
        let suggestions = FakeSuggestionsRepository()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let now = calendar.date(from: DateComponents(year: 2026, month: 6, day: 20, hour: 12))!
        let viewModel = NewEntryViewModel(
            diaryRepository: FakeDiaryRepository(), suggestionsRepository: suggestions, searchRepository: FakeSearchRepository(),
            now: { now })

        await viewModel.loadSuggestions()

        let lastRange = await suggestions.lastAroundHourRange
        #expect(lastRange?.startHour == 11)
        #expect(lastRange?.endHour == 13)
    }

    @Test func searchWithEmptyQueryClearsResults() async {
        let search = FakeSearchRepository()
        await search.setResults([SearchResult(id: 1, kind: .item, name: "Bread")])
        let viewModel = NewEntryViewModel(
            diaryRepository: FakeDiaryRepository(), suggestionsRepository: FakeSuggestionsRepository(), searchRepository: search)
        viewModel.searchQuery = "bre"
        await viewModel.search()
        #expect(!viewModel.searchResults.isEmpty)

        viewModel.searchQuery = ""
        await viewModel.search()

        #expect(viewModel.searchResults.isEmpty)
    }

    @Test func searchPopulatesResultsForNonEmptyQuery() async {
        let search = FakeSearchRepository()
        await search.setResults([SearchResult(id: 1, kind: .item, name: "Bread")])
        let viewModel = NewEntryViewModel(
            diaryRepository: FakeDiaryRepository(), suggestionsRepository: FakeSuggestionsRepository(), searchRepository: search)
        viewModel.searchQuery = "bre"

        await viewModel.search()

        #expect(viewModel.searchResults.map(\.id) == [1])
    }

    @Test func saveItemCreatesItemEntry() async {
        let diary = FakeDiaryRepository()
        let viewModel = NewEntryViewModel(
            diaryRepository: diary, suggestionsRepository: FakeSuggestionsRepository(), searchRepository: FakeSearchRepository())

        await viewModel.save(kind: .item, id: 7, servings: 2, consumedAt: Date())

        let lastInput = await diary.lastCreateInput
        #expect(viewModel.didSave)
        if case .item(let id, let servings, _) = lastInput {
            #expect(id == 7)
            #expect(servings == 2)
        } else {
            Issue.record("expected .item input")
        }
    }

    @Test func saveRecipeCreatesRecipeEntry() async {
        let diary = FakeDiaryRepository()
        let viewModel = NewEntryViewModel(
            diaryRepository: diary, suggestionsRepository: FakeSuggestionsRepository(), searchRepository: FakeSearchRepository())

        await viewModel.save(kind: .recipe, id: 9, servings: 1.5, consumedAt: Date())

        let lastInput = await diary.lastCreateInput
        #expect(viewModel.didSave)
        if case .recipe(let id, let servings, _) = lastInput {
            #expect(id == 9)
            #expect(servings == 1.5)
        } else {
            Issue.record("expected .recipe input")
        }
    }

    @Test func saveFailureSetsErrorAndDoesNotMarkSaved() async {
        let diary = FakeDiaryRepository()
        await diary.setCreateError(TestError())
        let viewModel = NewEntryViewModel(
            diaryRepository: diary, suggestionsRepository: FakeSuggestionsRepository(), searchRepository: FakeSearchRepository())

        await viewModel.save(kind: .item, id: 1, servings: 1, consumedAt: Date())

        #expect(!viewModel.didSave)
        #expect(viewModel.saveError != nil)
    }
}
