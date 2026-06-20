import SwiftUI

/// Port of the targets form in `web/src/UserProfile.tsx` (PRD §4.6, §9): edit
/// calories, calories max, protein, fiber, and added sugar targets. Profile
/// (§9) is not yet built, so this is reached directly from the diary list's
/// "Targets" toolbar button until Profile lands and can host the link instead.
struct TargetsView: View {
    @State var viewModel: TargetsViewModel
    let onSave: () -> Void

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView()
            case .error(let message):
                Text(message).foregroundStyle(.red)
            case .loaded:
                form
            }
        }
        .navigationTitle("Daily Targets")
        .task {
            await viewModel.load()
        }
        .onChange(of: viewModel.didSave) {
            if viewModel.didSave { onSave() }
        }
    }

    private var form: some View {
        Form {
            Section {
                numericField("Calorie min (kcal)", value: $viewModel.calories)
                numericField("Calorie max (kcal)", value: $viewModel.caloriesMax)
                numericField("Protein (g)", value: $viewModel.proteinGrams)
                numericField("Dietary Fiber (g)", value: $viewModel.dietaryFiberGrams)
                numericField("Added Sugar (g)", value: $viewModel.addedSugarsGrams)
            }
            Section {
                Button("Save Targets") { Task { await viewModel.save() } }
            }
        }
    }

    private func numericField(_ title: String, value: Binding<Double>) -> some View {
        HStack {
            Text(title)
            Spacer()
            TextField(title, value: value, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
        }
    }
}
