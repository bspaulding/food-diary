import Testing
import Foundation
@testable import FoodDiary

struct DiaryApiTests {
    @Test func decodesEntriesResponseWithItemAndRecipeEntries() throws {
        let json = """
            {
              "food_diary_diary_entry": [
                {
                  "id": 5, "consumed_at": "2026-06-20T12:30:00.123Z",
                  "calories": 200, "servings": 1.5,
                  "nutrition_item": {
                    "id": 1, "description": "Almonds", "calories": 160,
                    "added_sugars_grams": 0, "protein_grams": 6, "dietary_fiber_grams": 3.5
                  },
                  "recipe": null
                },
                {
                  "id": 6, "consumed_at": "2026-06-20T18:00:00Z",
                  "calories": 450, "servings": 1,
                  "nutrition_item": null,
                  "recipe": {
                    "id": 9, "name": "Soup", "calories": 450, "total_servings": 4,
                    "recipe_items": [
                      { "servings": 2, "nutrition_item": { "added_sugars_grams": 1, "protein_grams": 8, "dietary_fiber_grams": 2 } }
                    ]
                  }
                }
              ]
            }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Diary.EntriesResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryDiaryEntry.count == 2)
        let itemEntry = response.foodDiaryDiaryEntry[0]
        #expect(itemEntry.nutritionItem?.dietaryFiberGrams == 3.5)
        #expect(itemEntry.recipe == nil)
        let recipeEntry = response.foodDiaryDiaryEntry[1]
        #expect(recipeEntry.nutritionItem == nil)
        #expect(recipeEntry.recipe?.recipeItems.first?.nutritionItem.proteinGrams == 8)
    }

    @Test func decodesWeeklyStatsWithNullSum() throws {
        let json = """
            { "current_week": {"aggregate": {"sum": {"calories": 1234.5}}},
              "past_four_weeks": {"aggregate": {"sum": {"calories": null}}} }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Diary.WeeklyStatsResponse.self, from: Data(json.utf8))
        #expect(response.currentWeek.aggregate.sum.calories == 1234.5)
        #expect(response.pastFourWeeks.aggregate.sum.calories == nil)
    }

    @Test func decodesSingleDiaryEntry() throws {
        let json = """
            { "food_diary_diary_entry_by_pk": {
                "id": 7, "consumed_at": "2026-06-20T12:00:00Z", "calories": 100,
                "servings": 1, "nutrition_item": null, "recipe": null } }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Diary.SingleEntryResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryDiaryEntryByPk.id == 7)
    }

    @Test func decodesCreateEntryResponse() throws {
        let json = "{ \"insert_food_diary_diary_entry_one\": { \"id\": 42 } }"
        let response = try JSONCoding.decoder.decode(
            Api.Diary.CreateEntryResponse.self, from: Data(json.utf8))
        #expect(response.insertFoodDiaryDiaryEntryOne.id == 42)
    }

    @Test func encodesItemEntryInputAsXorRecipe() throws {
        let encoder = JSONCoding.encoder
        let input = AnyEncodable(Api.Diary.ItemEntryInput(servings: 2, nutritionItemId: 9))
        struct Wrapper: Encodable { var entry: AnyEncodable }
        let data = try encoder.encode(Wrapper(entry: input))
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("\"nutrition_item_id\":9"))
        #expect(!json.contains("recipe_id"))
    }
}
