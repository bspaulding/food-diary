import Testing
import Foundation
@testable import FoodDiary

struct TargetsApiTests {
    @Test func decodesNutritionTargetsRowsEmptyForFreshUser() throws {
        let json = "{ \"food_diary_nutrition_target\": [] }"
        let response = try JSONCoding.decoder.decode(
            Api.Targets.GetResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryNutritionTarget.isEmpty)
    }

    @Test func decodesNutritionTargetsRow() throws {
        let json = """
            { "food_diary_nutrition_target": [
                { "calories": 2000, "calories_max": 2400, "protein_grams": 130,
                  "dietary_fiber_grams": 25, "added_sugars_grams": 25 }
              ] }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Targets.GetResponse.self, from: Data(json.utf8))
        #expect(response.foodDiaryNutritionTarget.first?.proteinGrams == 130)
    }

    @Test func decodesUpsertResponse() throws {
        let json = "{ \"insert_food_diary_nutrition_target_one\": { \"user_id\": \"auth0|abc\" } }"
        let response = try JSONCoding.decoder.decode(
            Api.Targets.SetResponse.self, from: Data(json.utf8))
        #expect(response.insertFoodDiaryNutritionTargetOne.userId == "auth0|abc")
    }

    @Test func encodesTargetsAsSnakeCaseForUpsert() throws {
        let targets = NutritionTargets(calories: 2000, caloriesMax: 2400, proteinGrams: 130, dietaryFiberGrams: 25, addedSugarsGrams: 25)
        let data = try JSONCoding.encoder.encode(targets)
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("\"calories_max\":2400"))
        #expect(json.contains("\"dietary_fiber_grams\":25"))
    }
}
