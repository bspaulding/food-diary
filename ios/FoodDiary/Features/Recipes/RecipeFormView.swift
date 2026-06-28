import SwiftUI

/// Port of `web/src/NewRecipeForm.tsx` (PRD §4.5): name, total servings, and a
/// list of recipe items picked via search-as-you-type over existing nutrition
/// items only. Nested new-item creation is out of scope (matches the web TODO).
struct RecipeFormView: View {
    @State var viewModel: RecipeFormViewModel
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
        .navigationTitle(viewModel.recipeID == nil ? "New Recipe" : "Edit Recipe")
        .task {
            await viewModel.load()
        }
        .onChange(of: viewModel.didSave) {
            if viewModel.didSave { onSave() }
        }
    }

    private var form: some View {
        Form {
            Section("Info") {
                TextField("Name", text: $viewModel.name)
                HStack {
                    Text("Total Servings")
                    Spacer()
                    TextField("Total Servings", value: $viewModel.totalServings, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                }
            }
            Section("Items") {
                if viewModel.items.isEmpty {
                    Text("No items in recipe.").foregroundStyle(Theme.textSecondary)
                } else {
                    ForEach(Array(viewModel.items.enumerated()), id: \.element.id) { index, item in
                        HStack {
                            Text(item.name)
                            Spacer()
                            TextField(
                                "Servings",
                                value: Binding(
                                    get: { item.servings },
                                    set: { viewModel.setServings($0, forItemAt: index) }),
                                format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 60)
                        }
                    }
                    .onDelete { viewModel.removeItem(at: $0) }
                }
            }
            Section("Add Items") {
                TextField("Search items", text: $viewModel.searchQuery)
                    .onChange(of: viewModel.searchQuery) {
                        Task { await viewModel.search() }
                    }
                ForEach(viewModel.searchResults) { result in
                    Button {
                        viewModel.addItem(result)
                    } label: {
                        HStack {
                            Text("⊕").foregroundStyle(Theme.accent)
                            Text(result.name).foregroundStyle(Theme.textPrimary)
                        }
                    }
                }
            }
            Section {
                Button("Save Recipe") { Task { await viewModel.save() } }
                    .buttonStyle(.webPrimary)
                    .listRowBackground(Color.clear)
            }
        }
        .webListStyle()
    }
}
