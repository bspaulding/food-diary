import Foundation

/// The three macros tracked on the diary rings — ported from `web/src/DiaryList.tsx`'s
/// `MacroKey` subset that's actually used by `recipeTotalForKey`/`entryTotalMacro`
/// (the calories ring is computed separately from server-side `entry.calories`,
/// never via this enum — see `dayCalories`).
enum DiaryMacroKey: Sendable {
    case proteinGrams, dietaryFiberGrams, addedSugarsGrams
}

extension EntryMacros {
    fileprivate subscript(_ key: DiaryMacroKey) -> Double {
        switch key {
        case .proteinGrams: return proteinGrams
        case .dietaryFiberGrams: return dietaryFiberGrams
        case .addedSugarsGrams: return addedSugarsGrams
        }
    }
}

extension EntryNutritionItem {
    fileprivate subscript(_ key: DiaryMacroKey) -> Double {
        switch key {
        case .proteinGrams: return proteinGrams
        case .dietaryFiberGrams: return dietaryFiberGrams
        case .addedSugarsGrams: return addedSugarsGrams
        }
    }
}

/// Ported verbatim from `web/src/DiaryList.tsx` (`recipeTotalForKey`,
/// `entryTotalMacro`, `totalMacro`) for exact web/iOS parity.
enum MacroCalculations {
    static func recipeTotal(_ key: DiaryMacroKey, in recipe: EntryRecipe?) -> Double {
        guard let recipe else { return 0 }
        let totalServings = recipe.totalServings > 0 ? Double(recipe.totalServings) : 1
        let sum = recipe.recipeItems.reduce(0.0) { acc, recipeItem in
            acc + recipeItem.servings * recipeItem.nutritionItem[key]
        }
        return sum / totalServings
    }

    static func entryTotal(_ key: DiaryMacroKey, for entry: DiaryEntry) -> Double {
        let itemTotal = entry.nutritionItem?[key] ?? 0
        return entry.servings * (itemTotal + recipeTotal(key, in: entry.recipe))
    }

    static func dayTotal(_ key: DiaryMacroKey, across entries: [DiaryEntry]) -> Double {
        entries.reduce(0.0) { $0 + entryTotal(key, for: $1) }
    }

    /// Per-day calories ring uses the server-computed `entry.calories`, summed
    /// then `ceil`-ed — *not* `entryTotal` (web `DiaryList.tsx:195`).
    static func dayCalories(_ entries: [DiaryEntry]) -> Double {
        entries.reduce(0.0) { $0 + $1.calories }.rounded(.up)
    }
}
