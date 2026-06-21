import Foundation

/// Port of `web/src/NewDiaryEntryForm.tsx` (PRD §4.3/§5): three suggestion
/// sources plus a search typeahead, expanding to a servings input on Save.
@MainActor @Observable
final class NewEntryViewModel {
    enum Mode { case suggestions, search }

    private let diaryRepository: DiaryRepository
    private let suggestionsRepository: SuggestionsRepository
    private let searchRepository: SearchRepository
    private let now: () -> Date

    var mode: Mode = .suggestions
    var searchQuery: String = ""

    private(set) var recentSuggestions: [SuggestionEntry] = []
    private(set) var aroundHourSuggestions: [SuggestionEntry] = []
    private(set) var mostLoggedSuggestions: [SuggestionEntry] = []
    private(set) var searchResults: [SearchResult] = []
    private(set) var saveError: String?
    private(set) var didSave = false

    init(diaryRepository: DiaryRepository, suggestionsRepository: SuggestionsRepository,
         searchRepository: SearchRepository, now: @escaping () -> Date = Date.init) {
        self.diaryRepository = diaryRepository
        self.suggestionsRepository = suggestionsRepository
        self.searchRepository = searchRepository
        self.now = now
    }

    var hasNoSuggestions: Bool {
        aroundHourSuggestions.isEmpty && recentSuggestions.isEmpty && mostLoggedSuggestions.isEmpty
    }

    func loadSuggestions() async {
        let range = SuggestionHourRange.aroundHour(now: now())
        async let aroundHour = suggestionsRepository.topAroundHour(startHour: range.startHour, endHour: range.endHour)
        async let recent = suggestionsRepository.recent()
        async let mostLogged = suggestionsRepository.topLogged()
        aroundHourSuggestions = (try? await aroundHour) ?? []
        recentSuggestions = (try? await recent) ?? []
        mostLoggedSuggestions = (try? await mostLogged) ?? []
    }

    func search() async {
        guard !searchQuery.isEmpty else {
            searchResults = []
            return
        }
        searchResults = (try? await searchRepository.searchItemsAndRecipes(searchQuery)) ?? []
    }

    func save(kind: SearchResult.Kind, id: Int, servings: Double, consumedAt: Date) async {
        saveError = nil
        let input: NewDiaryEntryInput = kind == .item
            ? .item(nutritionItemID: id, servings: servings, consumedAt: consumedAt)
            : .recipe(recipeID: id, servings: servings, consumedAt: consumedAt)
        do {
            _ = try await diaryRepository.createEntry(input)
            didSave = true
        } catch {
            saveError = String(describing: error)
        }
    }
}
