CREATE OR REPLACE FUNCTION food_diary.recipe_calories(recipe food_diary.recipe)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
select sum(total_calories) / recipe.total_servings from (
select recipe_id, servings, calories, servings * calories as total_calories
from food_diary.recipe_item
left outer join food_diary.nutrition_item
on food_diary.recipe_item.nutrition_item_id = food_diary.nutrition_item.id
where recipe_id = recipe.id) recipe_item_with_calories;
$function$;
