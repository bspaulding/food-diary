import Testing
@testable import FoodDiary

struct JSONFieldCoercionTests {
    @Test func stringDefaultsToEmptyWhenMissing() {
        #expect(JSONFieldCoercion.string([:], "description") == "")
    }

    @Test func numberCoercesIntAndDouble() {
        #expect(JSONFieldCoercion.number(["a": 5], "a") == 5)
        #expect(JSONFieldCoercion.number(["a": 5.5], "a") == 5.5)
    }

    @Test func numberDefaultsToZeroWhenMissingOrNonNumeric() {
        #expect(JSONFieldCoercion.number([:], "a") == 0)
        #expect(JSONFieldCoercion.number(["a": "oops"], "a") == 0)
    }

    @Test func nutritionJSONMappingParsesAllFields() {
        let dict: [String: Any] = [
            "description": "Banana", "calories": 105, "total_fat_grams": 0.4,
            "protein_grams": 1.3,
        ]
        let result = NutritionJSONMapping.parse(dict)
        #expect(result.description == "Banana")
        #expect(result.calories == 105)
        #expect(result.totalFatGrams == 0.4)
        #expect(result.proteinGrams == 1.3)
        #expect(result.sodiumMilligrams == 0)
    }
}
