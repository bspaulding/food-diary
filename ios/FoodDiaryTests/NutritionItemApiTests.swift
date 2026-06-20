import Testing
import Foundation
@testable import FoodDiary

struct NutritionItemApiTests {
    @Test func decodesGetNutritionItemByPk() throws {
        let json = """
            { "food_diary_nutrition_item_by_pk": {
                "id": 1, "description": "Almonds", "calories": 160,
                "total_fat_grams": 14, "saturated_fat_grams": 1.1, "trans_fat_grams": 0,
                "polyunsaturated_fat_grams": 3.4, "monounsaturated_fat_grams": 9,
                "cholesterol_milligrams": 0, "sodium_milligrams": 0,
                "total_carbohydrate_grams": 6, "dietary_fiber_grams": 3.5,
                "total_sugars_grams": 1.2, "added_sugars_grams": 0, "protein_grams": 6
            } }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Items.GetByIdResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryNutritionItemByPk.description == "Almonds")
    }

    @Test func decodesCreateNutritionItemResponse() throws {
        let json = "{ \"insert_food_diary_nutrition_item_one\": { \"id\": 9 } }"
        let response = try JSONCoding.decoder.decode(
            Api.Items.CreateResponse.self, from: Data(json.utf8))
        #expect(response.insertFoodDiaryNutritionItemOne.id == 9)
    }

    @Test func encodesNutritionItemInputAsSnakeCase() throws {
        let input = NutritionItemInput(
            description: "Almonds", calories: 160, totalFatGrams: 14, saturatedFatGrams: 1.1,
            transFatGrams: 0, polyunsaturatedFatGrams: 3.4, monounsaturatedFatGrams: 9,
            cholesterolMilligrams: 0, sodiumMilligrams: 0, totalCarbohydrateGrams: 6,
            dietaryFiberGrams: 3.5, totalSugarsGrams: 1.2, addedSugarsGrams: 0, proteinGrams: 6)
        let data = try JSONCoding.encoder.encode(input)
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("\"total_fat_grams\":14"))
        #expect(json.contains("\"dietary_fiber_grams\":3.5"))
    }
}
