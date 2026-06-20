import Testing
import Foundation
@testable import FoodDiary

struct RecipeApiTests {
    @Test func decodesGetRecipeByPk() throws {
        let json = """
            { "food_diary_recipe_by_pk": {
                "id": 9, "name": "Soup", "total_servings": 4,
                "recipe_items": [
                  { "servings": 2, "nutrition_item": { "id": 1, "description": "Carrots", "calories": 50 } }
                ]
            } }
            """
        let response = try JSONCoding.decoder.decode(
            Api.Recipes.GetByIdResponse.self, from: Data(json.utf8))
        let recipe = response.foodDiaryRecipeByPk
        #expect(recipe.name == "Soup")
        #expect(recipe.recipeItems.first?.nutritionItem.description == "Carrots")
    }

    @Test func decodesCreateRecipeResponse() throws {
        let json = "{ \"insert_food_diary_recipe_one\": { \"id\": 9 } }"
        let response = try JSONCoding.decoder.decode(
            Api.Recipes.CreateResponse.self, from: Data(json.utf8))
        #expect(response.insertFoodDiaryRecipeOne.id == 9)
    }

    @Test func encodesRecipeInputNestedItemsAsSnakeCase() throws {
        let input = Api.Recipes.CreateInput(
            name: "Soup", totalServings: 4,
            recipeItems: Api.Recipes.RecipeItemsData(data: [
                Api.Recipes.RecipeItemInput(servings: 2, nutritionItemId: 1)
            ]))
        let data = try JSONCoding.encoder.encode(input)
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("\"total_servings\":4"))
        #expect(json.contains("\"nutrition_item_id\":1"))
    }
}
