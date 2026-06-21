import Testing
import Foundation
@testable import FoodDiary

private actor FakeTrendsRepository: TrendsRepository {
    var trendsToReturn: [WeeklyTrendsData] = []
    var trendsError: Error?

    func weeklyTrends() async throws -> [WeeklyTrendsData] {
        if let trendsError { throw trendsError }
        return trendsToReturn
    }

    func setTrends(_ trends: [WeeklyTrendsData]) { trendsToReturn = trends }
    func setTrendsError(_ error: Error) { trendsError = error }
}

private actor FakeTargetsRepository: TargetsRepository {
    var targetsToReturn: NutritionTargets = .default
    func targets() async throws -> NutritionTargets { targetsToReturn }
    func save(_ targets: NutritionTargets) async throws {}
    func setTargets(_ targets: NutritionTargets) { targetsToReturn = targets }
}

private struct TestError: Error {}

@MainActor
struct TrendsViewModelTests {
    @Test func loadPopulatesTrendsSortedByWeekOfYearAscending() async {
        let repo = FakeTrendsRepository()
        await repo.setTrends([
            WeeklyTrendsData(weekOfYear: "24", protein: 100, calories: 1900, addedSugar: 10),
            WeeklyTrendsData(weekOfYear: "22", protein: 90, calories: 1800, addedSugar: 20),
            WeeklyTrendsData(weekOfYear: "23", protein: 95, calories: 1850, addedSugar: 15),
        ])
        let viewModel = TrendsViewModel(trendsRepository: repo, targetsRepository: FakeTargetsRepository())

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.trends.map(\.weekOfYear) == ["22", "23", "24"])
    }

    @Test func loadPopulatesTargets() async {
        let repo = FakeTrendsRepository()
        let targets = FakeTargetsRepository()
        await targets.setTargets(NutritionTargets(
            calories: 2100, caloriesMax: 2500, proteinGrams: 140,
            dietaryFiberGrams: 30, addedSugarsGrams: 20))
        let viewModel = TrendsViewModel(trendsRepository: repo, targetsRepository: targets)

        await viewModel.load()

        #expect(viewModel.targets.calories == 2100)
        #expect(viewModel.targets.proteinGrams == 140)
        #expect(viewModel.targets.addedSugarsGrams == 20)
    }

    @Test func loadFailureSetsErrorState() async {
        let repo = FakeTrendsRepository()
        await repo.setTrendsError(TestError())
        let viewModel = TrendsViewModel(trendsRepository: repo, targetsRepository: FakeTargetsRepository())

        await viewModel.load()

        #expect(viewModel.state == .error(""))
    }

    @Test func loadWithEmptyTrendsIsLoadedWithEmptyArray() async {
        let repo = FakeTrendsRepository()
        let viewModel = TrendsViewModel(trendsRepository: repo, targetsRepository: FakeTargetsRepository())

        await viewModel.load()

        #expect(viewModel.state == .loaded)
        #expect(viewModel.trends.isEmpty)
    }
}
