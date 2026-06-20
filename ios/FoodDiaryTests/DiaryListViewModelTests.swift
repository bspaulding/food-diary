import Testing
import Foundation
@testable import FoodDiary

private actor FakeDiaryRepository: DiaryRepository {
    var entriesToReturn: [DiaryEntry] = []
    var weeklyStatsToReturn = WeeklyStatsTotals(currentWeekCalories: 0, pastFourWeeksCalories: 0)
    var entriesError: Error?
    var deleteError: Error?
    private(set) var lastEntriesRange: (from: Date, to: Date?)?
    private(set) var deletedIDs: [Int] = []

    func entries(from: Date, to: Date?) async throws -> [DiaryEntry] {
        lastEntriesRange = (from, to)
        if let entriesError { throw entriesError }
        return entriesToReturn
    }

    func weeklyStats(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) async throws -> WeeklyStatsTotals {
        weeklyStatsToReturn
    }

    func entry(id: Int) async throws -> DiaryEntry {
        entriesToReturn.first { $0.id == id }!
    }

    func createEntry(_ input: NewDiaryEntryInput) async throws -> Int { 0 }
    func updateEntry(id: Int, servings: Double, consumedAt: Date) async throws {}

    func delete(entryID: Int) async throws {
        deletedIDs.append(entryID)
        if let deleteError { throw deleteError }
    }
}

private actor FakeTargetsRepository: TargetsRepository {
    var targetsToReturn = NutritionTargets.default
    func targets() async throws -> NutritionTargets { targetsToReturn }
    func save(_ targets: NutritionTargets) async throws {}
}

private struct TestError: Error {}

@MainActor
struct DiaryListViewModelTests {
    func entry(id: Int, calories: Double = 100) -> DiaryEntry {
        DiaryEntry(id: id, consumedAt: Date(), calories: calories, servings: 1, nutritionItem: nil, recipe: nil)
    }

    @Test func loadPopulatesEntriesStatsAndTargets() async {
        let diary = FakeDiaryRepository()
        await diary.setEntries([entry(id: 1)])
        let targets = FakeTargetsRepository()
        let viewModel = DiaryListViewModel(diaryRepository: diary, targetsRepository: targets)

        await viewModel.load()

        #expect(viewModel.entries.map(\.id) == [1])
        #expect(viewModel.state == .loaded)
        #expect(viewModel.targets == .default)
    }

    @Test func loadFailureSetsErrorState() async {
        let diary = FakeDiaryRepository()
        await diary.setEntriesError(TestError())
        let viewModel = DiaryListViewModel(diaryRepository: diary, targetsRepository: FakeTargetsRepository())

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }

    @Test func previousWeekIncrementsPageAndReloads() async {
        let diary = FakeDiaryRepository()
        let viewModel = DiaryListViewModel(diaryRepository: diary, targetsRepository: FakeTargetsRepository())
        await viewModel.load()

        await viewModel.goToPreviousWeek()

        #expect(viewModel.page == 1)
        #expect(viewModel.canGoToNextWeek)
    }

    @Test func nextWeekDoesNothingAtPageZero() async {
        let diary = FakeDiaryRepository()
        let viewModel = DiaryListViewModel(diaryRepository: diary, targetsRepository: FakeTargetsRepository())
        await viewModel.load()

        await viewModel.goToNextWeek()

        #expect(viewModel.page == 0)
    }

    @Test func nextWeekDecrementsPageWhenAvailable() async {
        let diary = FakeDiaryRepository()
        let viewModel = DiaryListViewModel(diaryRepository: diary, targetsRepository: FakeTargetsRepository())
        await viewModel.load()
        await viewModel.goToPreviousWeek()

        await viewModel.goToNextWeek()

        #expect(viewModel.page == 0)
        #expect(!viewModel.canGoToNextWeek)
    }

    @Test func deleteRemovesEntryOptimistically() async {
        let diary = FakeDiaryRepository()
        await diary.setEntries([entry(id: 1), entry(id: 2)])
        let viewModel = DiaryListViewModel(diaryRepository: diary, targetsRepository: FakeTargetsRepository())
        await viewModel.load()

        await viewModel.delete(entry(id: 1))

        #expect(viewModel.entries.map(\.id) == [2])
    }

    @Test func deleteRollsBackOnFailure() async {
        let diary = FakeDiaryRepository()
        await diary.setEntries([entry(id: 1), entry(id: 2)])
        await diary.setDeleteError(TestError())
        let viewModel = DiaryListViewModel(diaryRepository: diary, targetsRepository: FakeTargetsRepository())
        await viewModel.load()

        await viewModel.delete(entry(id: 1))

        #expect(viewModel.entries.map(\.id) == [1, 2])
    }
}

private extension FakeDiaryRepository {
    func setEntries(_ entries: [DiaryEntry]) { entriesToReturn = entries }
    func setEntriesError(_ error: Error) { entriesError = error }
    func setDeleteError(_ error: Error) { deleteError = error }
}
