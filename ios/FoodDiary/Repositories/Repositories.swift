import Foundation

/// Protocol-backed repositories (PRD §6.1) so tests inject fakes. Phase 0 only
/// declares the protocols; Phase 1 implements them against `GraphQLClient` and
/// the operations in `Api.swift`.
struct WeeklyStatsTotals: Sendable, Hashable {
    var currentWeekCalories: Double
    var pastFourWeeksCalories: Double
}

enum NewDiaryEntryInput: Sendable {
    case item(nutritionItemID: Int, servings: Double, consumedAt: Date)
    case recipe(recipeID: Int, servings: Double, consumedAt: Date)
}

protocol DiaryRepository: Sendable {
    /// `to == nil` means "no upper bound" (the most recent page).
    func entries(from: Date, to: Date?) async throws -> [DiaryEntry]
    func weeklyStats(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) async throws -> WeeklyStatsTotals
    func entry(id: Int) async throws -> DiaryEntry
    func createEntry(_ input: NewDiaryEntryInput) async throws -> Int
    func updateEntry(id: Int, servings: Double, consumedAt: Date) async throws
    func delete(entryID: Int) async throws
}

struct DiaryRepositoryImpl: DiaryRepository {
    let client: GraphQLClient

    func entries(from: Date, to: Date?) async throws -> [DiaryEntry] {
        let startDate = AnyEncodable(JSONCoding.isoString(from))
        if let to {
            let response = try await client.execute(
                query: Api.Diary.getEntriesDateRange,
                variables: ["startDate": startDate, "endDate": AnyEncodable(JSONCoding.isoString(to))],
                as: Api.Diary.EntriesResponse.self)
            return response.foodDiaryDiaryEntry
        }
        let response = try await client.execute(
            query: Api.Diary.getEntriesFromDate,
            variables: ["startDate": startDate],
            as: Api.Diary.EntriesResponse.self)
        return response.foodDiaryDiaryEntry
    }

    func weeklyStats(currentWeekStart: Date, todayStart: Date, fourWeeksAgoStart: Date) async throws -> WeeklyStatsTotals {
        let response = try await client.execute(
            query: Api.Diary.getWeeklyStats,
            variables: [
                "currentWeekStart": AnyEncodable(JSONCoding.isoString(currentWeekStart)),
                "todayStart": AnyEncodable(JSONCoding.isoString(todayStart)),
                "fourWeeksAgoStart": AnyEncodable(JSONCoding.isoString(fourWeeksAgoStart)),
            ],
            as: Api.Diary.WeeklyStatsResponse.self)
        return WeeklyStatsTotals(
            currentWeekCalories: response.currentWeek.aggregate.sum.calories ?? 0,
            pastFourWeeksCalories: response.pastFourWeeks.aggregate.sum.calories ?? 0)
    }

    func entry(id: Int) async throws -> DiaryEntry {
        let response = try await client.execute(
            query: Api.Diary.getDiaryEntry, variables: ["id": AnyEncodable(id)],
            as: Api.Diary.SingleEntryResponse.self)
        return response.foodDiaryDiaryEntryByPk
    }

    func createEntry(_ input: NewDiaryEntryInput) async throws -> Int {
        let entry: AnyEncodable
        switch input {
        case .item(let nutritionItemID, let servings, let consumedAt):
            entry = AnyEncodable(Api.Diary.ItemEntryInput(
                servings: servings, nutritionItemId: nutritionItemID,
                consumedAt: JSONCoding.isoString(consumedAt)))
        case .recipe(let recipeID, let servings, let consumedAt):
            entry = AnyEncodable(Api.Diary.RecipeEntryInput(
                servings: servings, recipeId: recipeID,
                consumedAt: JSONCoding.isoString(consumedAt)))
        }
        let response = try await client.execute(
            query: Api.Diary.createDiaryEntry, variables: ["entry": entry],
            as: Api.Diary.CreateEntryResponse.self)
        return response.insertFoodDiaryDiaryEntryOne.id
    }

    func updateEntry(id: Int, servings: Double, consumedAt: Date) async throws {
        struct Attrs: Encodable { var servings: Double; var consumedAt: String }
        let attrs = Attrs(servings: servings, consumedAt: JSONCoding.isoString(consumedAt))
        _ = try await client.execute(
            query: Api.Diary.updateDiaryEntry,
            variables: ["id": AnyEncodable(id), "attrs": AnyEncodable(attrs)],
            as: Api.Diary.UpdateEntryResponse.self)
    }

    func delete(entryID: Int) async throws {
        struct Response: Decodable { struct Row: Decodable { var id: Int }; var deleteFoodDiaryDiaryEntryByPk: Row }
        _ = try await client.execute(
            query: Api.Diary.deleteDiaryEntry, variables: ["id": AnyEncodable(entryID)],
            as: Response.self)
    }
}

protocol NutritionItemRepository: Sendable {
    func item(id: Int) async throws -> NutritionItem
    func create(_ input: NutritionItemInput) async throws -> Int
    func update(id: Int, _ input: NutritionItemInput) async throws
}

struct NutritionItemRepositoryImpl: NutritionItemRepository {
    let client: GraphQLClient

    func item(id: Int) async throws -> NutritionItem {
        let response = try await client.execute(
            query: Api.Items.getById, variables: ["id": AnyEncodable(id)],
            as: Api.Items.GetByIdResponse.self)
        return response.foodDiaryNutritionItemByPk
    }

    func create(_ input: NutritionItemInput) async throws -> Int {
        let response = try await client.execute(
            query: Api.Items.create, variables: ["nutritionItem": AnyEncodable(input)],
            as: Api.Items.CreateResponse.self)
        return response.insertFoodDiaryNutritionItemOne.id
    }

    func update(id: Int, _ input: NutritionItemInput) async throws {
        _ = try await client.execute(
            query: Api.Items.update, variables: ["id": AnyEncodable(id), "attrs": AnyEncodable(input)],
            as: Api.Items.UpdateResponse.self)
    }
}

struct RecipeItemDraft: Sendable, Equatable {
    var nutritionItemID: Int
    var servings: Double
}

protocol RecipeRepository: Sendable {
    func recipe(id: Int) async throws -> Recipe
    func create(name: String, totalServings: Int, items: [RecipeItemDraft]) async throws -> Int
    func update(id: Int, name: String, totalServings: Int, items: [RecipeItemDraft]) async throws
}

struct RecipeRepositoryImpl: RecipeRepository {
    let client: GraphQLClient

    func recipe(id: Int) async throws -> Recipe {
        let response = try await client.execute(
            query: Api.Recipes.getById, variables: ["id": AnyEncodable(id)],
            as: Api.Recipes.GetByIdResponse.self)
        return response.foodDiaryRecipeByPk
    }

    func create(name: String, totalServings: Int, items: [RecipeItemDraft]) async throws -> Int {
        let input = Api.Recipes.CreateInput(
            name: name, totalServings: totalServings,
            recipeItems: Api.Recipes.RecipeItemsData(
                data: items.map { Api.Recipes.RecipeItemInput(servings: $0.servings, nutritionItemId: $0.nutritionItemID) }))
        let response = try await client.execute(
            query: Api.Recipes.create, variables: ["input": AnyEncodable(input)],
            as: Api.Recipes.CreateResponse.self)
        return response.insertFoodDiaryRecipeOne.id
    }

    func update(id: Int, name: String, totalServings: Int, items: [RecipeItemDraft]) async throws {
        struct Response: Decodable {}
        let attrs = Api.Recipes.UpdateAttrs(name: name, totalServings: totalServings)
        let itemsInput = items.map {
            Api.Recipes.UpdateRecipeItemInput(servings: $0.servings, nutritionItemId: $0.nutritionItemID, recipeId: id)
        }
        _ = try await client.execute(
            query: Api.Recipes.update,
            variables: ["id": AnyEncodable(id), "attrs": AnyEncodable(attrs), "items": AnyEncodable(itemsInput)],
            as: Response.self)
    }
}

protocol SearchRepository: Sendable {
    func searchItemsAndRecipes(_ query: String) async throws -> [SearchResult]
    func searchItems(_ query: String) async throws -> [SearchResult]
}

struct SearchRepositoryImpl: SearchRepository {
    let client: GraphQLClient

    func searchItemsAndRecipes(_ query: String) async throws -> [SearchResult] {
        let response = try await client.execute(
            query: Api.Search.itemsAndRecipes, variables: ["search": AnyEncodable(query)],
            as: Api.Search.ItemsAndRecipesResponse.self)
        return response.foodDiarySearchNutritionItems.map { SearchResult(id: $0.id, kind: .item, name: $0.description) }
            + response.foodDiarySearchRecipes.map { SearchResult(id: $0.id, kind: .recipe, name: $0.name) }
    }

    func searchItems(_ query: String) async throws -> [SearchResult] {
        let response = try await client.execute(
            query: Api.Search.itemsOnly, variables: ["search": AnyEncodable(query)],
            as: Api.Search.ItemsOnlyResponse.self)
        return response.foodDiarySearchNutritionItems.map { SearchResult(id: $0.id, kind: .item, name: $0.description) }
    }
}

struct SuggestionEntry: Identifiable, Hashable, Sendable {
    var kind: SearchResult.Kind
    var id: Int
    var name: String
    var consumedAt: Date
}

protocol SuggestionsRepository: Sendable {
    func recent() async throws -> [SuggestionEntry]
    func topAroundHour(startHour: Int, endHour: Int) async throws -> [SuggestionEntry]
    func topLogged() async throws -> [SuggestionEntry]
}

struct SuggestionsRepositoryImpl: SuggestionsRepository {
    let client: GraphQLClient

    private func toSuggestions(_ rows: [Api.Suggestions.EntryRow]) -> [SuggestionEntry] {
        rows.compactMap { row in
            if let item = row.nutritionItem {
                return SuggestionEntry(kind: .item, id: item.id, name: item.description, consumedAt: row.consumedAt)
            }
            if let recipe = row.recipe {
                return SuggestionEntry(kind: .recipe, id: recipe.id, name: recipe.name, consumedAt: row.consumedAt)
            }
            return nil
        }
    }

    func recent() async throws -> [SuggestionEntry] {
        let response = try await client.execute(
            query: Api.Suggestions.recent, as: Api.Suggestions.RecentEntriesResponse.self)
        return toSuggestions(response.foodDiaryDiaryEntryRecent)
    }

    func topAroundHour(startHour: Int, endHour: Int) async throws -> [SuggestionEntry] {
        let response = try await client.execute(
            query: Api.Suggestions.topAroundHour,
            variables: ["startHour": AnyEncodable(startHour), "endHour": AnyEncodable(endHour)],
            as: Api.Suggestions.TopEntriesAroundHourResponse.self)
        return toSuggestions(response.foodDiaryTopEntriesAroundHour)
    }

    /// Client-side most-logged merge over the last 100 entries (web
    /// `NewDiaryEntryForm.tsx:78-101`): count by item/recipe id, sort desc,
    /// take top 5.
    func topLogged() async throws -> [SuggestionEntry] {
        let response = try await client.execute(
            query: Api.Suggestions.topLogged, as: Api.Suggestions.TopLoggedResponse.self)
        let suggestions = toSuggestions(response.foodDiaryDiaryEntry)
        var counts: [String: (entry: SuggestionEntry, count: Int)] = [:]
        for suggestion in suggestions {
            let key = "\(suggestion.kind)_\(suggestion.id)"
            counts[key] = (suggestion, (counts[key]?.count ?? 0) + 1)
        }
        return counts.values.sorted { $0.count > $1.count }.prefix(5).map(\.entry)
    }
}

protocol TargetsRepository: Sendable {
    func targets() async throws -> NutritionTargets
    func save(_ targets: NutritionTargets) async throws
}

struct TargetsRepositoryImpl: TargetsRepository {
    let client: GraphQLClient

    func targets() async throws -> NutritionTargets {
        let response = try await client.execute(query: Api.Targets.get, as: Api.Targets.GetResponse.self)
        return response.foodDiaryNutritionTarget.first ?? .default
    }

    func save(_ targets: NutritionTargets) async throws {
        _ = try await client.execute(
            query: Api.Targets.set, variables: ["target": AnyEncodable(targets)],
            as: Api.Targets.SetResponse.self)
    }
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
