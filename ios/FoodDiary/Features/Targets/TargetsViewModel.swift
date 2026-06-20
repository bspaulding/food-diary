import Foundation

/// Port of `web/src/NutritionTargets.tsx` + the targets form in
/// `web/src/UserProfile.tsx` (PRD §4.6, §9): load the server-stored targets
/// (defaulting to `NutritionTargets.default` when no row exists yet — handled
/// by `TargetsRepositoryImpl.targets()`) and upsert edits back via
/// `TargetsRepository.save(_:)`. The diary list (`DiaryListViewModel.load()`)
/// re-fetches `targetsRepository.targets()` on every load, so saving here and
/// returning to the diary list naturally picks up the new values — no
/// additional in-memory cache is needed.
@MainActor @Observable
final class TargetsViewModel {
    enum State: Equatable {
        case loading, loaded, error(String)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    private let targetsRepository: TargetsRepository

    private(set) var state: State = .loading
    private(set) var didSave = false

    var calories: Double = NutritionTargets.default.calories
    var caloriesMax: Double = NutritionTargets.default.caloriesMax
    var proteinGrams: Double = NutritionTargets.default.proteinGrams
    var dietaryFiberGrams: Double = NutritionTargets.default.dietaryFiberGrams
    var addedSugarsGrams: Double = NutritionTargets.default.addedSugarsGrams

    init(targetsRepository: TargetsRepository) {
        self.targetsRepository = targetsRepository
    }

    func load() async {
        state = .loading
        do {
            let targets = try await targetsRepository.targets()
            apply(targets)
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }

    func save() async {
        didSave = false
        let targets = NutritionTargets(
            calories: calories, caloriesMax: caloriesMax, proteinGrams: proteinGrams,
            dietaryFiberGrams: dietaryFiberGrams, addedSugarsGrams: addedSugarsGrams)
        do {
            try await targetsRepository.save(targets)
            didSave = true
        } catch {
            state = .error(String(describing: error))
        }
    }

    private func apply(_ targets: NutritionTargets) {
        calories = targets.calories
        caloriesMax = targets.caloriesMax
        proteinGrams = targets.proteinGrams
        dietaryFiberGrams = targets.dietaryFiberGrams
        addedSugarsGrams = targets.addedSugarsGrams
    }
}
