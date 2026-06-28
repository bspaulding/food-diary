import SwiftUI

/// Port of `web/src/RecipeShow.tsx` (PRD §4.5): computed calories and
/// constituent items, with an entry point to Edit.
struct RecipeDetailView: View {
    @State var viewModel: RecipeDetailViewModel
    let onEdit: () -> Void

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView()
            case .error(let message):
                ErrorRetryView(message: message) { Task { await viewModel.load() } }
            case .loaded:
                if let recipe = viewModel.recipe {
                    detail(for: recipe)
                }
            }
        }
        .navigationTitle(viewModel.recipe?.name ?? "Recipe")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit", action: onEdit)
            }
        }
        .task {
            await viewModel.load()
        }
    }

    private func detail(for recipe: Recipe) -> some View {
        List {
            Section {
                HStack {
                    Text("Total Calories").fontWeight(.semibold)
                    Spacer()
                    Text("\(Int(viewModel.totalCalories.rounded())) kcal")
                }
                HStack {
                    Text("Calories per Serving").fontWeight(.semibold)
                    Spacer()
                    Text("\(Int(viewModel.caloriesPerServing.rounded())) kcal")
                }
            }
            Section("Ingredients") {
                if recipe.recipeItems.isEmpty {
                    Text("No recipe items.").foregroundStyle(Theme.textSecondary)
                } else {
                    ForEach(recipe.recipeItems, id: \.nutritionItem.id) { item in
                        VStack(alignment: .leading) {
                            Text(item.nutritionItem.description)
                            Text("\(item.servings.formatted()) servings - \(Int(viewModel.calories(for: item).rounded())) kcal")
                                .font(.caption)
                                .foregroundStyle(Theme.textSecondary)
                        }
                    }
                }
            }
        }
        .webListStyle()
    }
}
