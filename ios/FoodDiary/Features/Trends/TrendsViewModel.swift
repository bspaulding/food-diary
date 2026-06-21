import Foundation

/// Port of `web/src/Trends.tsx`: load weekly trend rows and the nutrition
/// targets used as chart reference lines.
@MainActor @Observable
final class TrendsViewModel {
    enum State: Equatable {
        case loading, loaded, error(String)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    private let trendsRepository: TrendsRepository
    private let targetsRepository: TargetsRepository

    private(set) var state: State = .loading
    private(set) var trends: [WeeklyTrendsData] = []
    private(set) var targets: NutritionTargets = .default

    init(trendsRepository: TrendsRepository, targetsRepository: TargetsRepository) {
        self.trendsRepository = trendsRepository
        self.targetsRepository = targetsRepository
    }

    func load() async {
        state = .loading
        do {
            let trends = try await trendsRepository.weeklyTrends()
            self.trends = trends.sorted {
                (Int($0.weekOfYear) ?? 0) < (Int($1.weekOfYear) ?? 0)
            }
            self.targets = try await targetsRepository.targets()
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }
}
