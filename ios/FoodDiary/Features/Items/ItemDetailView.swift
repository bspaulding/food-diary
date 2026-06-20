import SwiftUI

/// Port of `web/src/NutritionItemShow.tsx` (PRD §4.4): macro detail display
/// with an entry point to Edit.
struct ItemDetailView: View {
    @State var viewModel: ItemDetailViewModel
    let onEdit: () -> Void

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView()
            case .error(let message):
                Text(message).foregroundStyle(.red)
            case .loaded:
                if let item = viewModel.item {
                    detail(for: item)
                }
            }
        }
        .navigationTitle(viewModel.item?.description ?? "Item")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit", action: onEdit)
            }
        }
        .task {
            await viewModel.load()
        }
    }

    private func detail(for item: NutritionItem) -> some View {
        List {
            macroRow("Calories", item.calories, bold: true)
            macroRow("Total Fat (g)", item.totalFatGrams, bold: true)
            macroRow("Saturated Fat (g)", item.saturatedFatGrams)
            macroRow("Trans Fat (g)", item.transFatGrams)
            macroRow("Polyunsaturated Fat (g)", item.polyunsaturatedFatGrams)
            macroRow("Monounsaturated Fat (g)", item.monounsaturatedFatGrams)
            macroRow("Cholesterol (mg)", item.cholesterolMilligrams, bold: true)
            macroRow("Sodium (mg)", item.sodiumMilligrams, bold: true)
            macroRow("Total Carbohydrate (g)", item.totalCarbohydrateGrams, bold: true)
            macroRow("Dietary Fiber (g)", item.dietaryFiberGrams)
            macroRow("Total Sugars (g)", item.totalSugarsGrams)
            macroRow("Added Sugars (g)", item.addedSugarsGrams)
            macroRow("Protein (g)", item.proteinGrams, bold: true)
        }
    }

    private func macroRow(_ title: String, _ value: Double, bold: Bool = false) -> some View {
        HStack {
            Text(title).fontWeight(bold ? .semibold : .regular)
            Spacer()
            Text(value.formatted())
        }
    }
}
