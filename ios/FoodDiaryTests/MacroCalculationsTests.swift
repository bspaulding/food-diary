import Testing
import Foundation
@testable import FoodDiary

struct MacroCalculationsTests {
    func item(protein: Double, fiber: Double, sugar: Double, calories: Double = 0) -> EntryNutritionItem {
        EntryNutritionItem(id: 1, description: "x", calories: calories,
            addedSugarsGrams: sugar, proteinGrams: protein, dietaryFiberGrams: fiber)
    }

    func recipeItem(protein: Double, fiber: Double, sugar: Double, servings: Double) -> EntryRecipeItem {
        EntryRecipeItem(servings: servings,
            nutritionItem: EntryMacros(addedSugarsGrams: sugar, proteinGrams: protein, dietaryFiberGrams: fiber))
    }

    @Test func recipeTotalDividesByTotalServings() {
        let recipe = EntryRecipe(id: 1, name: "Soup", calories: 100, totalServings: 4,
            recipeItems: [recipeItem(protein: 8, fiber: 2, sugar: 0, servings: 2)])
        // sum(servings * protein) / totalServings = (2*8) / 4 = 4
        #expect(MacroCalculations.recipeTotal(.proteinGrams, in: recipe) == 4)
    }

    @Test func recipeTotalTreatsZeroTotalServingsAsOne() {
        let recipe = EntryRecipe(id: 1, name: "Soup", calories: 100, totalServings: 0,
            recipeItems: [recipeItem(protein: 8, fiber: 0, sugar: 0, servings: 2)])
        #expect(MacroCalculations.recipeTotal(.proteinGrams, in: recipe) == 16)
    }

    @Test func recipeTotalForNilRecipeIsZero() {
        #expect(MacroCalculations.recipeTotal(.proteinGrams, in: nil) == 0)
    }

    @Test func entryTotalForItemOnlyEntry() {
        let entry = DiaryEntry(id: 1, consumedAt: Date(), calories: 200, servings: 2,
            nutritionItem: item(protein: 5, fiber: 1, sugar: 0), recipe: nil)
        // servings * (itemMacro + recipeTotal) = 2 * (5 + 0) = 10
        #expect(MacroCalculations.entryTotal(.proteinGrams, for: entry) == 10)
    }

    @Test func entryTotalForRecipeOnlyEntry() {
        let recipe = EntryRecipe(id: 1, name: "Soup", calories: 100, totalServings: 4,
            recipeItems: [recipeItem(protein: 8, fiber: 0, sugar: 0, servings: 2)])
        let entry = DiaryEntry(id: 1, consumedAt: Date(), calories: 200, servings: 3,
            nutritionItem: nil, recipe: recipe)
        // servings * (0 + recipeTotal) = 3 * (0 + (2*8/4)) = 3 * 4 = 12
        #expect(MacroCalculations.entryTotal(.proteinGrams, for: entry) == 12)
    }

    @Test func dayTotalSumsAcrossEntries() {
        let a = DiaryEntry(id: 1, consumedAt: Date(), calories: 100, servings: 1,
            nutritionItem: item(protein: 5, fiber: 0, sugar: 0), recipe: nil)
        let b = DiaryEntry(id: 2, consumedAt: Date(), calories: 100, servings: 1,
            nutritionItem: item(protein: 3, fiber: 0, sugar: 0), recipe: nil)
        #expect(MacroCalculations.dayTotal(.proteinGrams, across: [a, b]) == 8)
    }

    @Test func dayCaloriesSumsServerCaloriesAndCeils() {
        let a = DiaryEntry(id: 1, consumedAt: Date(), calories: 100.2, servings: 1, nutritionItem: nil, recipe: nil)
        let b = DiaryEntry(id: 2, consumedAt: Date(), calories: 100.3, servings: 1, nutritionItem: nil, recipe: nil)
        #expect(MacroCalculations.dayCalories([a, b]) == 201) // ceil(200.5)
    }
}
