import Testing
import Foundation
@testable import FoodDiary

private actor FakeDiaryRepository: DiaryRepository {
    var entryToReturn: DiaryEntry?
    var entryError: Error?
    var updateError: Error?
    var deleteError: Error?
    private(set) var lastUpdate: (id: Int, servings: Double, consumedAt: Date)?
    private(set) var deletedIDs: [Int] = []

    func entries(from: Date, to: Date?) async throws -> [DiaryEntry] { [] }
    func weeklyStats(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) async throws -> WeeklyStatsTotals {
        WeeklyStatsTotals(currentWeekCalories: 0, pastFourWeeksCalories: 0)
    }

    func entry(id: Int) async throws -> DiaryEntry {
        if let entryError { throw entryError }
        return entryToReturn!
    }

    func createEntry(_ input: NewDiaryEntryInput) async throws -> Int { 0 }

    func updateEntry(id: Int, servings: Double, consumedAt: Date) async throws {
        lastUpdate = (id, servings, consumedAt)
        if let updateError { throw updateError }
    }

    func delete(entryID: Int) async throws {
        deletedIDs.append(entryID)
        if let deleteError { throw deleteError }
    }

    func setEntry(_ entry: DiaryEntry) { entryToReturn = entry }
    func setEntryError(_ error: Error) { entryError = error }
    func setUpdateError(_ error: Error) { updateError = error }
    func setDeleteError(_ error: Error) { deleteError = error }
}

private struct TestError: Error {}

@MainActor
struct EditEntryViewModelTests {
    func entry(id: Int = 1, servings: Double = 2) -> DiaryEntry {
        DiaryEntry(id: id, consumedAt: Date(), calories: 100, servings: servings, nutritionItem: nil, recipe: nil)
    }

    @Test func loadPopulatesServingsAndConsumedAt() async {
        let diary = FakeDiaryRepository()
        let loaded = entry(servings: 3)
        await diary.setEntry(loaded)
        let viewModel = EditEntryViewModel(entryID: 1, diaryRepository: diary)

        await viewModel.load()

        #expect(viewModel.servings == 3)
        #expect(viewModel.consumedAt == loaded.consumedAt)
        #expect(viewModel.state == .loaded)
    }

    @Test func loadFailureSetsErrorState() async {
        let diary = FakeDiaryRepository()
        await diary.setEntryError(TestError())
        let viewModel = EditEntryViewModel(entryID: 1, diaryRepository: diary)

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }

    @Test func saveUpdatesEntryAndMarksSaved() async {
        let diary = FakeDiaryRepository()
        await diary.setEntry(entry())
        let viewModel = EditEntryViewModel(entryID: 1, diaryRepository: diary)
        await viewModel.load()
        viewModel.servings = 5

        await viewModel.save()

        let lastUpdate = await diary.lastUpdate
        #expect(lastUpdate?.id == 1)
        #expect(lastUpdate?.servings == 5)
        #expect(viewModel.didSave)
    }

    @Test func saveFailureSetsErrorState() async {
        let diary = FakeDiaryRepository()
        await diary.setEntry(entry())
        await diary.setUpdateError(TestError())
        let viewModel = EditEntryViewModel(entryID: 1, diaryRepository: diary)
        await viewModel.load()

        await viewModel.save()

        #expect(viewModel.state == .error(""))
        #expect(!viewModel.didSave)
    }

    @Test func deleteRemovesEntryAndMarksDeleted() async {
        let diary = FakeDiaryRepository()
        await diary.setEntry(entry())
        let viewModel = EditEntryViewModel(entryID: 1, diaryRepository: diary)
        await viewModel.load()

        await viewModel.delete()

        let deletedIDs = await diary.deletedIDs
        #expect(deletedIDs == [1])
        #expect(viewModel.didDelete)
    }

    @Test func deleteFailureSetsErrorState() async {
        let diary = FakeDiaryRepository()
        await diary.setEntry(entry())
        await diary.setDeleteError(TestError())
        let viewModel = EditEntryViewModel(entryID: 1, diaryRepository: diary)
        await viewModel.load()

        await viewModel.delete()

        #expect(viewModel.state == .error(""))
        #expect(!viewModel.didDelete)
    }
}
