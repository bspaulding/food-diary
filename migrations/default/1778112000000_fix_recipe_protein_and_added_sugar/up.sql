-- Fix recipe_protein and recipe_added_sugar to divide by total_servings,
-- matching the convention established by recipe_calories.
-- Previously these returned total-recipe values instead of per-serving values.

CREATE OR REPLACE FUNCTION food_diary.recipe_protein(recipe food_diary.recipe)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT sum(total_protein) / recipe.total_servings FROM (
    SELECT recipe_id, servings, protein_grams, servings * protein_grams AS total_protein
    FROM food_diary.recipe_item
    LEFT OUTER JOIN food_diary.nutrition_item
      ON food_diary.recipe_item.nutrition_item_id = food_diary.nutrition_item.id
    WHERE recipe_id = recipe.id
  ) recipe_item_with_protein;
$$;

CREATE OR REPLACE FUNCTION food_diary.recipe_added_sugar(recipe food_diary.recipe)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT sum(total_added_sugar) / recipe.total_servings FROM (
    SELECT recipe_id, servings, added_sugars_grams, servings * added_sugars_grams AS total_added_sugar
    FROM food_diary.recipe_item
    LEFT OUTER JOIN food_diary.nutrition_item
      ON food_diary.recipe_item.nutrition_item_id = food_diary.nutrition_item.id
    WHERE recipe_id = recipe.id
  ) recipe_item_with_added_sugar;
$$;
