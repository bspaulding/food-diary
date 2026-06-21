import SwiftUI

/// Port of `web/src/NewNutritionItemForm.tsx` (PRD §4.4): manual entry of the
/// full macro set for create or edit, plus the Phase 3 autofill paths —
/// "Look Up" (`/llm/lookup`, `web/src/LLMLookupModal.tsx`) and "Scan Label"
/// (`/labeller/upload`, `web/src/CameraModal.tsx`). Both prefill the macro
/// fields below; the user still reviews/edits before Save.
struct ItemFormView: View {
    @State var viewModel: ItemFormViewModel
    @State private var showCamera = false
    let onSave: () -> Void

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView()
            case .error(let message):
                ErrorRetryView(message: message) { Task { await viewModel.load() } }
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
        .sheet(isPresented: $showCamera) {
            CameraCaptureView { imageData in
                Task { await viewModel.scanLabel(imageData: imageData) }
            }
        }
    }

    private var form: some View {
        Form {
            Section("Autofill") {
                HStack {
                    TextField("Describe the food", text: $viewModel.lookupQuery)
                    Button("Look Up") { Task { await viewModel.lookUp() } }
                        .disabled(viewModel.lookupState == .loading || viewModel.lookupQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                if viewModel.lookupState == .loading {
                    ProgressView("Looking up...")
                } else if case .error(let message) = viewModel.lookupState {
                    Text(message).foregroundStyle(.red)
                }

                Button("Scan Label") { showCamera = true }
                    .disabled(viewModel.scanState == .loading)
                if viewModel.scanState == .loading {
                    ProgressView("Scanning label...")
                } else if case .error(let message) = viewModel.scanState {
                    Text(message).foregroundStyle(.red)
                }
            }
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
