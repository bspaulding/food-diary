import Testing
import Foundation
@testable import FoodDiary

struct ExportImportApiTests {
    @Test func decodesExportEntriesWithItemEntry() throws {
        let json = """
            { "food_diary_diary_entry": [
                {
                  "servings": 1,
                  "consumed_at": "2022-08-28T14:30:00+00:00",
                  "nutrition_item": {
                    "description": "Honey Bunches of Oats",
                    "calories": 160,
                    "total_fat_grams": 2,
                    "saturated_fat_grams": 0,
                    "trans_fat_grams": 0,
                    "polyunsaturated_fat_grams": 0.5,
                    "monounsaturated_fat_grams": 1,
                    "cholesterol_milligrams": 0,
                    "sodium_milligrams": 190,
                    "total_carbohydrate_grams": 34,
                    "dietary_fiber_grams": 2,
                    "total_sugars_grams": 9,
                    "added_sugars_grams": 8,
                    "protein_grams": 3
                  },
                  "recipe": null
                }
              ] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Export.EntriesResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryDiaryEntry.count == 1)
        let entry = response.foodDiaryDiaryEntry[0]
        #expect(entry.servings == 1)
        #expect(entry.nutritionItem?.description == "Honey Bunches of Oats")
        #expect(entry.recipe == nil)
    }

    @Test func decodesExportEntriesWithRecipeEntry() throws {
        let json = """
            { "food_diary_diary_entry": [
                {
                  "servings": 2,
                  "consumed_at": "2022-08-29T14:30:00+00:00",
                  "nutrition_item": null,
                  "recipe": {
                    "name": "Test Recipe",
                    "recipe_items": [
                      {
                        "servings": 2,
                        "nutrition_item": {
                          "description": "Almondmilk",
                          "calories": 60,
                          "total_fat_grams": 2.5,
                          "saturated_fat_grams": 0,
                          "trans_fat_grams": 0,
                          "polyunsaturated_fat_grams": 0.5,
                          "monounsaturated_fat_grams": 1.5,
                          "cholesterol_milligrams": 0,
                          "sodium_milligrams": 150,
                          "total_carbohydrate_grams": 8,
                          "dietary_fiber_grams": 0,
                          "total_sugars_grams": 7,
                          "added_sugars_grams": 7,
                          "protein_grams": 1
                        }
                      }
                    ]
                  }
                }
              ] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Export.EntriesResponse.self, from: Data(json.utf8))
        let entry = response.foodDiaryDiaryEntry[0]
        #expect(entry.nutritionItem == nil)
        #expect(entry.recipe?.name == "Test Recipe")
        #expect(entry.recipe?.recipeItems.first?.nutritionItem.description == "Almondmilk")
    }

    @Test func encodesInsertDiaryEntriesWithNestedNewNutritionItemData() throws {
        let entries = [
            Api.Import.NewEntryInput(
                consumedAt: "2022-08-28T07:30:00-07:00",
                servings: 1,
                nutritionItem: Api.Import.NewItemData(
                    data: NutritionItemInput(
                        description: "Honey Bunches of Oats", calories: 160,
                        totalFatGrams: 2, saturatedFatGrams: 0, transFatGrams: 0,
                        polyunsaturatedFatGrams: 0.5, monounsaturatedFatGrams: 1,
                        cholesterolMilligrams: 0, sodiumMilligrams: 190,
                        totalCarbohydrateGrams: 34, dietaryFiberGrams: 2,
                        totalSugarsGrams: 9, addedSugarsGrams: 8, proteinGrams: 3)))
        ]
        let data = try JSONCoding.encoder.encode(entries)
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("\"consumed_at\":\"2022-08-28T07:30:00-07:00\""))
        #expect(json.contains("\"nutrition_item\":{\"data\":"))
        #expect(json.contains("\"total_fat_grams\":2"))
        #expect(!json.contains("\"nutritionItem\""))
    }

    @Test func decodesInsertDiaryEntriesResponse() throws {
        let json = "{ \"insert_food_diary_diary_entry\": { \"affected_rows\": 3 } }"
        let response = try JSONCoding.decoder.decode(
            Api.Import.InsertResponse.self, from: Data(json.utf8))
        #expect(response.insertFoodDiaryDiaryEntry.affectedRows == 3)
    }
}
