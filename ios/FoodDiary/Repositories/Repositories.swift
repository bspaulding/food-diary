import Foundation

/// Protocol-backed repositories (PRD §6.1) so tests inject fakes. Phase 0 only
/// declares the protocols; Phase 1 implements them against `GraphQLClient` and
/// the operations in `Api.swift`.
protocol DiaryRepository {
    func entries(from: Date, to: Date) async throws -> [DiaryEntry]
    func delete(entryID: Int) async throws
}

protocol NutritionItemRepository {
    func item(id: Int) async throws -> NutritionItem
    func create(_ item: NutritionItem) async throws -> NutritionItem
    func update(_ item: NutritionItem) async throws -> NutritionItem
}

protocol RecipeRepository {
    func recipe(id: Int) async throws -> Recipe
    func create(_ recipe: Recipe) async throws -> Recipe
    func update(_ recipe: Recipe) async throws -> Recipe
}

protocol SearchRepository {
    func search(query: String) async throws -> [SearchResult]
}

protocol TargetsRepository {
    func targets() async throws -> NutritionTargets
    func save(_ targets: NutritionTargets) async throws -> NutritionTargets
}

struct SearchResult: Identifiable, Hashable, Sendable {
    enum Kind: Hashable, Sendable {
        case item
        case recipe
    }

    var id: Int
    var kind: Kind
    var name: String
}
