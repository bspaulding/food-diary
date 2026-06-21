import Charts
import SwiftUI

/// Port of `web/src/Trends.tsx` (PRD §11/Phase 2): weekly calories/protein/
/// added-sugar charts with the corresponding `NutritionTargets` value drawn as
/// a reference line, using native Swift Charts (decision: no charting deps).
struct TrendsView: View {
    @State var viewModel: TrendsViewModel

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView()
            case .error(let message):
                ErrorRetryView(message: message) { Task { await viewModel.load() } }
            case .loaded:
                content
            }
        }
        .navigationTitle("Weekly Trends")
        .task {
            await viewModel.load()
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.trends.isEmpty {
            Text("No data available yet. Add some diary entries to see trends!")
                .foregroundStyle(.secondary)
                .padding()
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    chartSection(
                        title: "Average Daily Calories (per week)",
                        color: .blue,
                        target: viewModel.targets.calories
                    ) { trend in
                        (trend.weekOfYear, trend.calories)
                    }
                    chartSection(
                        title: "Average Daily Protein (g per week)",
                        color: .green,
                        target: viewModel.targets.proteinGrams
                    ) { trend in
                        (trend.weekOfYear, trend.protein)
                    }
                    chartSection(
                        title: "Average Daily Added Sugar (g per week)",
                        color: .red,
                        target: viewModel.targets.addedSugarsGrams
                    ) { trend in
                        (trend.weekOfYear, trend.addedSugar)
                    }
                }
                .padding()
            }
        }
    }

    private func chartSection(
        title: String, color: Color, target: Double,
        value: @escaping (WeeklyTrendsData) -> (String, Double)
    ) -> some View {
        VStack(alignment: .leading) {
            Text(title).font(.headline)
            Chart {
                ForEach(viewModel.trends, id: \.weekOfYear) { trend in
                    let (week, amount) = value(trend)
                    LineMark(
                        x: .value("Week", week),
                        y: .value(title, amount)
                    )
                    .foregroundStyle(color)
                    PointMark(
                        x: .value("Week", week),
                        y: .value(title, amount)
                    )
                    .foregroundStyle(color)
                }
                RuleMark(y: .value("Target", target))
                    .foregroundStyle(.secondary)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
            }
            .frame(height: 200)
        }
    }
}
