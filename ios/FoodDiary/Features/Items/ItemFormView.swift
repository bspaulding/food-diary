import SwiftUI

/// Port of `web/src/NewNutritionItemForm.tsx` (PRD §4.4): manual entry of the
/// full macro set for create or edit. Camera-scan/LLM-autofill are deferred to
/// Phase 3.
struct ItemFormView: View {
    @State var viewModel: ItemFormViewModel
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
        .navigationTitle(viewModel.itemID == nil ? "New Item" : "Edit Item")
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
                TextField("Description", text: $viewModel.description)
            }
            Section("Nutrition Facts") {
                numericField("Calories", value: $viewModel.calories)
                numericField("Total Fat (g)", value: $viewModel.totalFatGrams)
                numericField("Saturated Fat (g)", value: $viewModel.saturatedFatGrams)
                numericField("Trans Fat (g)", value: $viewModel.transFatGrams)
                numericField("Polyunsaturated Fat (g)", value: $viewModel.polyunsaturatedFatGrams)
                numericField("Monounsaturated Fat (g)", value: $viewModel.monounsaturatedFatGrams)
                numericField("Cholesterol (mg)", value: $viewModel.cholesterolMilligrams)
                numericField("Sodium (mg)", value: $viewModel.sodiumMilligrams)
                numericField("Total Carbohydrate (g)", value: $viewModel.totalCarbohydrateGrams)
                numericField("Dietary Fiber (g)", value: $viewModel.dietaryFiberGrams)
                numericField("Total Sugars (g)", value: $viewModel.totalSugarsGrams)
                numericField("Added Sugars (g)", value: $viewModel.addedSugarsGrams)
                numericField("Protein (g)", value: $viewModel.proteinGrams)
            }
            Section {
                Button("Save") { Task { await viewModel.save() } }
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
