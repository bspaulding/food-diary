import Foundation

/// Port of `web/src/NewRecipeForm.tsx` (PRD §4.5): create or edit a recipe's
/// name, total servings, and constituent items. Items are picked via
/// `SearchRepository.searchItems(_:)` (existing items only — nested new-item
/// creation is out of scope, matching the web's TODO).
@MainActor @Observable
final class RecipeFormViewModel {
    enum State: Equatable {
        case loading, loaded, error(String)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading), (.loaded, .loaded), (.error, .error): return true
            default: return false
            }
        }
    }

    /// A recipe item as edited in the form: the picked nutrition item's id and
    /// display name, plus the editable servings value.
    struct FormItem: Identifiable, Equatable {
        var nutritionItemID: Int
        var name: String
        var servings: Double

        var id: Int { nutritionItemID }
    }

    let recipeID: Int?
    private let recipeRepository: RecipeRepository
    private let searchRepository: SearchRepository

    private(set) var state: State = .loading
    private(set) var didSave = false

    var name: String = ""
    var totalServings: Int = 1
    private(set) var items: [FormItem] = []

    var searchQuery: String = ""
    private(set) var searchResults: [SearchResult] = []

    init(recipeID: Int?, recipeRepository: RecipeRepository, searchRepository: SearchRepository) {
        self.recipeID = recipeID
        self.recipeRepository = recipeRepository
        self.searchRepository = searchRepository
    }

    func load() async {
        guard let recipeID else {
            state = .loaded
            return
        }
        state = .loading
        do {
            let recipe = try await recipeRepository.recipe(id: recipeID)
            apply(recipe)
            state = .loaded
        } catch {
            state = .error(String(describing: error))
        }
    }

    func search() async {
        guard !searchQuery.isEmpty else {
            searchResults = []
            return
        }
        searchResults = (try? await searchRepository.searchItems(searchQuery)) ?? []
    }

    func addItem(_ result: SearchResult) {
        items.append(FormItem(nutritionItemID: result.id, name: result.name, servings: 1))
        searchQuery = ""
        searchResults = []
    }

    func removeItem(at offsets: IndexSet) {
        items.remove(atOffsets: offsets)
    }

    func setServings(_ servings: Double, forItemAt index: Int) {
        guard items.indices.contains(index) else { return }
        items[index].servings = servings
    }

    func save() async {
        let drafts = items.map { RecipeItemDraft(nutritionItemID: $0.nutritionItemID, servings: $0.servings) }
        do {
            if let recipeID {
                try await recipeRepository.update(id: recipeID, name: name, totalServings: totalServings, items: drafts)
            } else {
                _ = try await recipeRepository.create(name: name, totalServings: totalServings, items: drafts)
            }
            didSave = true
        } catch {
            state = .error(String(describing: error))
        }
    }

    private func apply(_ recipe: Recipe) {
        name = recipe.name
        totalServings = recipe.totalServings
        items = recipe.recipeItems.map {
            FormItem(nutritionItemID: $0.nutritionItem.id, name: $0.nutritionItem.description, servings: $0.servings)
        }
    }
}
