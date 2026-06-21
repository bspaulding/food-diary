import Foundation

/// Orchestration behind the "Log <item>" App Intent (Phase 5 Widgets/Shortcuts,
/// PRD §5): resolve a free-text query to a `SearchResult` (item or recipe) via
/// `SearchRepository`, then create a diary entry via `DiaryRepository`. Kept
/// separate from `LogDiaryEntryIntent` so the matching/creation logic is
/// unit-testable without `AppIntents` framework plumbing.
struct LogDiaryEntryService: Sendable {
    enum LogError: Error, Equatable {
        case noMatch
    }

    struct LogResult: Sendable, Equatable {
        var matchedID: Int
        var matchedKind: SearchResult.Kind
        var matchedName: String
        var diaryEntryID: Int
    }

    let diaryRepository: DiaryRepository
    let searchRepository: SearchRepository
    let now: @Sendable () -> Date

    init(diaryRepository: DiaryRepository, searchRepository: SearchRepository, now: @Sendable @escaping () -> Date = Date.init) {
        self.diaryRepository = diaryRepository
        self.searchRepository = searchRepository
        self.now = now
    }

    /// Finds the best match for `query` (case-insensitive exact name match
    /// preferred, falling back to the first search result) and logs it with
    /// `servings` (defaulting to 1) consumed now.
    func log(query: String, servings: Double?) async throws -> LogResult {
        let results = try await searchRepository.searchItemsAndRecipes(query)
        guard let match = bestMatch(for: query, in: results) else {
            throw LogError.noMatch
        }
        let resolvedServings = servings ?? 1
        let consumedAt = now()
        let input: NewDiaryEntryInput = match.kind == .item
            ? .item(nutritionItemID: match.id, servings: resolvedServings, consumedAt: consumedAt)
            : .recipe(recipeID: match.id, servings: resolvedServings, consumedAt: consumedAt)
        let entryID = try await diaryRepository.createEntry(input)
        return LogResult(matchedID: match.id, matchedKind: match.kind, matchedName: match.name, diaryEntryID: entryID)
    }

    private func bestMatch(for query: String, in results: [SearchResult]) -> SearchResult? {
        if let exact = results.first(where: { $0.name.caseInsensitiveCompare(query) == .orderedSame }) {
            return exact
        }
        return results.first
    }
}
