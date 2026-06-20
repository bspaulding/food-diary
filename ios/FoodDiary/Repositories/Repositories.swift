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
