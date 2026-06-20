import Foundation

/// Port of `web/src/NewNutritionItemForm.tsx` (PRD §4.4): create or edit a
/// nutrition item's full macro set. Manual entry only — the web's camera-scan
/// and LLM-autofill buttons are deferred to Phase 3.
@MainActor @Observable
final class ItemFormViewModel {
    enum State: Equatable {
        case loading, loaded, error(String)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    let itemID: Int?
    private let itemRepository: NutritionItemRepository

    private(set) var state: State = .loading
    private(set) var didSave = false

    var description: String = ""
    var calories: Double = 0
    var totalFatGrams: Double = 0
    var saturatedFatGrams: Double = 0
    var transFatGrams: Double = 0
    var polyunsaturatedFatGrams: Double = 0
    var monounsaturatedFatGrams: Double = 0
    var cholesterolMilligrams: Double = 0
    var sodiumMilligrams: Double = 0
    var totalCarbohydrateGrams: Double = 0
    var dietaryFiberGrams: Double = 0
    var totalSugarsGrams: Double = 0
    var addedSugarsGrams: Double = 0
    var proteinGrams: Double = 0

    init(itemID: Int?, itemRepository: NutritionItemRepository) {
        self.itemID = itemID
        self.itemRepository = itemRepository
    }

    func load() async {
        guard let itemID else {
            state = .loaded
            return
        }
        state = .loading
        do {
            let item = try await itemRepository.item(id: itemID)
            apply(item)
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }

    func save() async {
        let input = NutritionItemInput(
            description: description, calories: calories,
            totalFatGrams: totalFatGrams, saturatedFatGrams: saturatedFatGrams,
            transFatGrams: transFatGrams, polyunsaturatedFatGrams: polyunsaturatedFatGrams,
            monounsaturatedFatGrams: monounsaturatedFatGrams, cholesterolMilligrams: cholesterolMilligrams,
            sodiumMilligrams: sodiumMilligrams, totalCarbohydrateGrams: totalCarbohydrateGrams,
            dietaryFiberGrams: dietaryFiberGrams, totalSugarsGrams: totalSugarsGrams,
            addedSugarsGrams: addedSugarsGrams, proteinGrams: proteinGrams)
        do {
            if let itemID {
                try await itemRepository.update(id: itemID, input)
            } else {
                _ = try await itemRepository.create(input)
            }
            didSave = true
        } catch {
            state = .error(String(describing: error))
        }
    }

    private func apply(_ item: NutritionItem) {
        description = item.description
        calories = item.calories
        totalFatGrams = item.totalFatGrams
        saturatedFatGrams = item.saturatedFatGrams
        transFatGrams = item.transFatGrams
        polyunsaturatedFatGrams = item.polyunsaturatedFatGrams
        monounsaturatedFatGrams = item.monounsaturatedFatGrams
        cholesterolMilligrams = item.cholesterolMilligrams
        sodiumMilligrams = item.sodiumMilligrams
        totalCarbohydrateGrams = item.totalCarbohydrateGrams
        dietaryFiberGrams = item.dietaryFiberGrams
        totalSugarsGrams = item.totalSugarsGrams
        addedSugarsGrams = item.addedSugarsGrams
        proteinGrams = item.proteinGrams
    }
}
