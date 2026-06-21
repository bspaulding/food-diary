import SwiftUI

/// Port of `web/src/DiaryList.tsx` (PRD §4.2).
struct DiaryListView: View {
    @State var viewModel: DiaryListViewModel
    let router: Router

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView()
            case .error(let message):
                ErrorRetryView(message: message) { Task { await viewModel.load() } }
            case .idle, .loaded:
                list
            }
        }
        .navigationTitle("Food Diary")
        .toolbar {
            ToolbarItem {
                Button("Trends") { router.push(.trends) }
            }
            ToolbarItem {
                Button("Profile") { router.push(.profile) }
            }
            ToolbarItem {
                Button("Add Entry") { router.push(.newEntry) }
            }
        }
        .task {
            await viewModel.load()
        }
    }

    private var list: some View {
        List {
            if let weeklyStats = viewModel.weeklyStats {
                Section {
                    weeklyStatsHeader(weeklyStats)
                }
            }
            if viewModel.groupedEntries.isEmpty {
                Text("No entries this week.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.groupedEntries) { group in
                    Section {
                        dayHeader(group)
                        ForEach(group.entries) { entry in
                            entryRow(entry)
                        }
                    }
                }
            }
            pagingControls
        }
    }

    private func weeklyStatsHeader(_ stats: WeeklyStatsTotals) -> some View {
        let sevenDayAvg = WeeklyStats.calculateDailyAverage(total: stats.currentWeekCalories, days: 7)
        let fourWeekAvg = WeeklyStats.calculateDailyAverage(
            total: stats.pastFourWeeksCalories, days: WeeklyStats.calculateFourWeeksDays(now: Date()))
        return HStack {
            VStack {
                Text("\(sevenDayAvg) kcal/day")
                Text("Last 7 Days").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack {
                Text("\(fourWeekAvg) kcal/day")
                Text("4 Week Avg").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func dayHeader(_ group: DiaryGrouping.DayGroup) -> some View {
        HStack(spacing: 16) {
            DateBadge(date: group.day)
            MacroRing(value: MacroCalculations.dayCalories(group.entries),
                      target: viewModel.targets.calories, max: viewModel.targets.caloriesMax,
                      label: "KCAL")
            MacroRing(value: MacroCalculations.dayTotal(.proteinGrams, across: group.entries),
                      target: viewModel.targets.proteinGrams, label: "Protein", unit: "g")
            MacroRing(value: MacroCalculations.dayTotal(.dietaryFiberGrams, across: group.entries),
                      target: viewModel.targets.dietaryFiberGrams, label: "Fiber", unit: "g")
            MacroRing(value: MacroCalculations.dayTotal(.addedSugarsGrams, across: group.entries),
                      target: viewModel.targets.addedSugarsGrams, label: "Added Sugar", unit: "g", isLimit: true)
        }
    }

    private func entryRow(_ entry: DiaryEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(Int(entry.calories.rounded())) kcal, "
                + "\(Int(MacroCalculations.entryTotal(.proteinGrams, for: entry).rounded()))g protein, "
                + "\(Int(MacroCalculations.entryTotal(.dietaryFiberGrams, for: entry).rounded()))g fiber")
                .font(.headline)
            Button {
                if let recipeID = entry.recipe?.id {
                    router.push(.recipeDetail(recipeID))
                } else if let itemID = entry.nutritionItem?.id {
                    router.push(.itemDetail(itemID))
                }
            } label: {
                Text(entry.nutritionItem?.description ?? entry.recipe?.name ?? "")
            }
            HStack {
                Text("\(servingsLabel(entry.servings)) at \(entry.consumedAt.formatted(date: .omitted, time: .shortened))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Edit") { router.push(.editEntry(entry.id)) }
                Button("Delete", role: .destructive) {
                    Task { await viewModel.delete(entry) }
                }
            }
            if entry.recipe != nil {
                Text("RECIPE")
                    .font(.caption2)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.secondary, in: RoundedRectangle(cornerRadius: 4))
                    .foregroundStyle(.white)
            }
        }
    }

    private func servingsLabel(_ servings: Double) -> String {
        servings == 1 ? "1 serving" : "\(servings.formatted()) servings"
    }

    private var pagingControls: some View {
        HStack {
            Button("← Previous Week") { Task { await viewModel.goToPreviousWeek() } }
                .disabled(viewModel.state == .loading)
            Spacer()
            if viewModel.canGoToNextWeek {
                Button("Next Week →") { Task { await viewModel.goToNextWeek() } }
                    .disabled(viewModel.state == .loading)
            }
        }
    }
}
