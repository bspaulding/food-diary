import Foundation

/// Shared coercion for loosely-typed JSON dictionaries from the LLM/labeller
/// sidecars and the on-device model: strings default to `""`, numbers
/// default to `0` if missing or non-numeric.
enum JSONFieldCoercion {
    static func string(_ dict: [String: Any], _ key: String) -> String {
        dict[key] as? String ?? ""
    }

    static func number(_ dict: [String: Any], _ key: String) -> Double {
        if let value = dict[key] as? Double { return value }
        if let value = dict[key] as? Int { return Double(value) }
        return 0
    }
}

/// Maps the `/llm/lookup` response shape (and the identical schema the
/// on-device model is prompted to emit, `OnDeviceAutofillClient.swift`) into
/// `NutritionItemInput`. Field names are full snake_case macro names, shared
/// by both autofill backends.
enum NutritionJSONMapping {
    static func parse(_ dict: [String: Any]) -> NutritionItemInput {
        NutritionItemInput(
            description: JSONFieldCoercion.string(dict, "description"),
            calories: JSONFieldCoercion.number(dict, "calories"),
            totalFatGrams: JSONFieldCoercion.number(dict, "total_fat_grams"),
            saturatedFatGrams: JSONFieldCoercion.number(dict, "saturated_fat_grams"),
            transFatGrams: JSONFieldCoercion.number(dict, "trans_fat_grams"),
            polyunsaturatedFatGrams: JSONFieldCoercion.number(dict, "polyunsaturated_fat_grams"),
            monounsaturatedFatGrams: JSONFieldCoercion.number(dict, "monounsaturated_fat_grams"),
            cholesterolMilligrams: JSONFieldCoercion.number(dict, "cholesterol_milligrams"),
            sodiumMilligrams: JSONFieldCoercion.number(dict, "sodium_milligrams"),
            totalCarbohydrateGrams: JSONFieldCoercion.number(dict, "total_carbohydrate_grams"),
            dietaryFiberGrams: JSONFieldCoercion.number(dict, "dietary_fiber_grams"),
            totalSugarsGrams: JSONFieldCoercion.number(dict, "total_sugars_grams"),
            addedSugarsGrams: JSONFieldCoercion.number(dict, "added_sugars_grams"),
            proteinGrams: JSONFieldCoercion.number(dict, "protein_grams"))
    }
}
