import Foundation

/// Port of `web/src/NutritionItemShow.tsx` (PRD §4.4): load and display a
/// single nutrition item's macro detail.
@MainActor @Observable
final class ItemDetailViewModel {
    enum State: Equatable {
        case loading, loaded, error(String)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    let itemID: Int
    private let itemRepository: NutritionItemRepository

    private(set) var state: State = .loading
    private(set) var item: NutritionItem?

    init(itemID: Int, itemRepository: NutritionItemRepository) {
        self.itemID = itemID
        self.itemRepository = itemRepository
    }

    func load() async {
        state = .loading
        do {
            item = try await itemRepository.item(id: itemID)
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }
}
