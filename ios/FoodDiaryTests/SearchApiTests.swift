import Testing
import Foundation
@testable import FoodDiary

struct SearchApiTests {
    @Test func decodesSearchItemsAndRecipes() throws {
        let json = """
            { "food_diary_search_nutrition_items": [{"id": 1, "description": "Almonds"}],
              "food_diary_search_recipes": [{"id": 2, "name": "Soup"}] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Search.ItemsAndRecipesResponse.self, from: Data(json.utf8))
        #expect(response.foodDiarySearchNutritionItems.first?.description == "Almonds")
        #expect(response.foodDiarySearchRecipes.first?.name == "Soup")
    }

    @Test func decodesSearchItemsOnly() throws {
        let json = """
            { "food_diary_search_nutrition_items": [{"id": 1, "description": "Almonds"}] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Search.ItemsOnlyResponse.self, from: Data(json.utf8))
        #expect(response.foodDiarySearchNutritionItems.count == 1)
    }

    @Test func decodesRecentEntries() throws {
        let json = """
            { "food_diary_diary_entry_recent": [
                {"consumed_at": "2026-06-20T12:00:00Z", "nutrition_item": {"id": 1, "description": "Almonds"}, "recipe": null},
                {"consumed_at": "2026-06-19T12:00:00Z", "nutrition_item": null, "recipe": {"id": 2, "name": "Soup"}}
              ] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Suggestions.RecentEntriesResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryDiaryEntryRecent.count == 2)
        #expect(response.foodDiaryDiaryEntryRecent[1].recipe?.name == "Soup")
    }

    @Test func decodesTopEntriesAroundHour() throws {
        let json = """
            { "food_diary_top_entries_around_hour": [
                {"consumed_at": "2026-06-20T12:00:00Z", "nutrition_item": {"id": 1, "description": "Almonds"}, "recipe": null}
              ] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Suggestions.TopEntriesAroundHourResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryTopEntriesAroundHour.count == 1)
    }
}
