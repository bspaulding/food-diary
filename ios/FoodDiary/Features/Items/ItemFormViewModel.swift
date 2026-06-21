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

    /// Loading/error state for an autofill action (LLM lookup or label scan),
    /// kept separate from `State` so an autofill failure doesn't replace the
    /// whole form with an error screen — the user can still edit/save
    /// manually (PRD §11, phase-3 plan §3: "Add loading + error states for
    /// each action").
    enum AutofillState: Equatable {
        case idle, loading, error(String)
    }

    let itemID: Int?
    private let itemRepository: NutritionItemRepository
    private let autofillClient: NutritionAutofillClient?

    private(set) var state: State = .loading
    private(set) var didSave = false

    /// Text entered for the "Look Up" action (`web/src/LLMLookupModal.tsx`
    /// equivalent — ported here as an inline field rather than a separate
    /// modal, per the phase-3 plan's "Add two buttons to ItemFormView").
    var lookupQuery: String = ""
    private(set) var lookupState: AutofillState = .idle
    private(set) var scanState: AutofillState = .idle

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

    init(
        itemID: Int?, itemRepository: NutritionItemRepository,
        autofillClient: NutritionAutofillClient? = nil
    ) {
        self.itemID = itemID
        self.itemRepository = itemRepository
        self.autofillClient = autofillClient
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

    /// "Look Up" button (PRD §4.4, phase-3 plan §3): `/llm/lookup` via
    /// `lookupQuery`, prefilling the macro fields for the user to
    /// review/edit before Save. Mirrors `lookupNutritionWithLLM`
    /// (`web/src/Api.ts:894`) being invoked from `LLMLookupModal.tsx`.
    func lookUp() async {
        let query = lookupQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, let autofillClient else { return }
        lookupState = .loading
        do {
            let input = try await autofillClient.lookupNutrition(description: query)
            apply(input)
            lookupState = .idle
        } catch {
            lookupState = .error(String(describing: error))
        }
    }

    /// "Scan Label" button (PRD §4.4, phase-3 plan §3): `/labeller/upload`
    /// with a captured nutrition-label photo, prefilling the macro fields.
    /// Mirrors `CameraModal.uploadImage` (`web/src/CameraModal.tsx:232`).
    func scanLabel(imageData: Data) async {
        guard let autofillClient else { return }
        scanState = .loading
        do {
            let input = try await autofillClient.uploadLabel(imageData: imageData)
            apply(input)
            scanState = .idle
        } catch {
            scanState = .error(String(describing: error))
        }
    }

    private func apply(_ input: NutritionItemInput) {
        description = input.description
        calories = input.calories
        totalFatGrams = input.totalFatGrams
        saturatedFatGrams = input.saturatedFatGrams
        transFatGrams = input.transFatGrams
        polyunsaturatedFatGrams = input.polyunsaturatedFatGrams
        monounsaturatedFatGrams = input.monounsaturatedFatGrams
        cholesterolMilligrams = input.cholesterolMilligrams
        sodiumMilligrams = input.sodiumMilligrams
        totalCarbohydrateGrams = input.totalCarbohydrateGrams
        dietaryFiberGrams = input.dietaryFiberGrams
        totalSugarsGrams = input.totalSugarsGrams
        addedSugarsGrams = input.addedSugarsGrams
        proteinGrams = input.proteinGrams
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
