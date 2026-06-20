import Foundation

/// Port of `web/src/DiaryEntryEditForm.tsx` (PRD §4.3/§5): edit servings and
/// consumed-at for an existing entry, or delete it.
@MainActor @Observable
final class EditEntryViewModel {
    enum State: Equatable {
        case loading, loaded, error(String)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    let entryID: Int
    private let diaryRepository: DiaryRepository

    private(set) var state: State = .loading
    private(set) var entry: DiaryEntry?
    private(set) var didSave = false
    private(set) var didDelete = false
    var servings: Double = 1
    var consumedAt: Date = Date()

    init(entryID: Int, diaryRepository: DiaryRepository) {
        self.entryID = entryID
        self.diaryRepository = diaryRepository
    }

    func load() async {
        state = .loading
        do {
            let entry = try await diaryRepository.entry(id: entryID)
            self.entry = entry
            servings = entry.servings
            consumedAt = entry.consumedAt
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }

    func save() async {
        do {
            try await diaryRepository.updateEntry(id: entryID, servings: servings, consumedAt: consumedAt)
            didSave = true
        } catch {
            state = .error(String(describing: error))
        }
    }

    func delete() async {
        do {
            try await diaryRepository.delete(entryID: entryID)
            didDelete = true
        } catch {
            state = .error(String(describing: error))
        }
    }
}
