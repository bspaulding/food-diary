import Foundation

@MainActor @Observable
final class DiaryListViewModel {
    enum LoadState: Equatable {
        case idle, loading, loaded, error(String)

        static func == (lhs: LoadState, rhs: LoadState) -> Bool {
            switch (lhs, rhs) {
            case (.idle, .idle), (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    private let diaryRepository: DiaryRepository
    private let targetsRepository: TargetsRepository
    private let now: () -> Date
    private let calendar: Calendar

    private(set) var page = 0
    private(set) var entries: [DiaryEntry] = []
    private(set) var weeklyStats: WeeklyStatsTotals?
    private(set) var targets: NutritionTargets = .default
    private(set) var state: LoadState = .idle

    init(diaryRepository: DiaryRepository, targetsRepository: TargetsRepository,
         now: @escaping () -> Date = Date.init, calendar: Calendar = .current) {
        self.diaryRepository = diaryRepository
        self.targetsRepository = targetsRepository
        self.now = now
        self.calendar = calendar
    }

    var canGoToNextWeek: Bool { page > 0 }

    var groupedEntries: [DiaryGrouping.DayGroup] {
        DiaryGrouping.groupedByDay(entries, calendar: calendar)
    }

    func load() async {
        state = .loading
        let now = self.now()
        let from = DateHelpers.pageStart(page: page, now: now, calendar: calendar)
        let to = page > 0 ? DateHelpers.pageStart(page: page - 1, now: now, calendar: calendar) : nil
        let anchors = DateHelpers.weeklyStatsAnchors(now: now, calendar: calendar)
        do {
            async let entriesResult = diaryRepository.entries(from: from, to: to)
            async let statsResult = diaryRepository.weeklyStats(
                currentWeekStart: anchors.sevenDaysAgoStart, todayStart: anchors.todayStart,
                fourWeeksAgoStart: anchors.fourWeeksAgoStart)
            async let targetsResult = targetsRepository.targets()
            entries = try await entriesResult
            weeklyStats = try await statsResult
            targets = try await targetsResult
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }

    func goToPreviousWeek() async {
        page += 1
        await load()
    }

    func goToNextWeek() async {
        guard canGoToNextWeek else { return }
        page -= 1
        await load()
    }

    /// Optimistic removal + rollback on failure (web `DiaryList.tsx` `deleteEntry`).
    func delete(_ entry: DiaryEntry) async {
        let backup = entries
        entries.removeAll { $0.id == entry.id }
        do {
            try await diaryRepository.delete(entryID: entry.id)
        } catch {
            entries = backup
        }
    }
}
