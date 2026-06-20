import Testing
import Foundation
@testable import FoodDiary

struct ModelDecodingTests {
    @Test func decodesNutritionItemFromSnakeCaseJSON() throws {
        let json = """
            {
              "id": 1,
              "description": "Almonds",
              "calories": 160,
              "total_fat_grams": 14,
              "saturated_fat_grams": 1.1,
              "trans_fat_grams": 0,
              "polyunsaturated_fat_grams": 3.4,
              "monounsaturated_fat_grams": 9,
              "cholesterol_milligrams": 0,
              "sodium_milligrams": 0,
              "total_carbohydrate_grams": 6,
              "dietary_fiber_grams": 3.5,
              "total_sugars_grams": 1.2,
              "added_sugars_grams": 0,
              "protein_grams": 6
            }
            """
        let item = try JSONCoding.decoder.decode(NutritionItem.self, from: Data(json.utf8))
        #expect(item.id == 1)
        #expect(item.description == "Almonds")
        #expect(item.dietaryFiberGrams == 3.5)
    }

    @Test func decodesDiaryEntryWithItemAndWithoutRecipe() throws {
        let json = """
            {
              "id": 5,
              "consumed_at": "2026-06-20T12:30:00.123Z",
              "calories": 200,
              "servings": 1.5,
              "nutrition_item": {
                "id": 1, "description": "Almonds", "calories": 160,
                "added_sugars_grams": 0, "protein_grams": 6, "dietary_fiber_grams": 3.5
              },
              "recipe": null
            }
            """
        let entry = try JSONCoding.decoder.decode(DiaryEntry.self, from: Data(json.utf8))
        #expect(entry.nutritionItem != nil)
        #expect(entry.recipe == nil)
    }

    @Test func decodesISO8601DateWithoutFractionalSeconds() throws {
        let json = """
            {
              "id": 5, "consumed_at": "2026-06-20T12:30:00Z", "calories": 200,
              "servings": 1, "nutrition_item": null, "recipe": null
            }
            """
        let entry = try JSONCoding.decoder.decode(DiaryEntry.self, from: Data(json.utf8))
        #expect(entry.consumedAt.timeIntervalSince1970 > 0)
    }

    @Test func nutritionTargetsDefaultMatchesWebDefaults() {
        let defaults = NutritionTargets.default
        #expect(defaults.calories == 2000)
        #expect(defaults.caloriesMax == 2400)
        #expect(defaults.proteinGrams == 130)
        #expect(defaults.dietaryFiberGrams == 25)
        #expect(defaults.addedSugarsGrams == 25)
    }
}
