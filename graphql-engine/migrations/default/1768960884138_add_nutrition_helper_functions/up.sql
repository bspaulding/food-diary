-- Create helper function to calculate recipe protein
CREATE FUNCTION food_diary.recipe_protein(recipe food_diary.recipe) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
select sum(total_protein) from (
select recipe_id, servings, protein_grams, servings * protein_grams as total_protein
from food_diary.recipe_item
left outer join food_diary.nutrition_item
on food_diary.recipe_item.nutrition_item_id = food_diary.nutrition_item.id
where recipe_id = recipe.id) recipe_item_with_protein;
$$;

-- Create helper function to calculate recipe added sugars
CREATE FUNCTION food_diary.recipe_added_sugar(recipe food_diary.recipe) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
select sum(total_added_sugar) from (
select recipe_id, servings, added_sugars_grams, servings * added_sugars_grams as total_added_sugar
from food_diary.recipe_item
left outer join food_diary.nutrition_item
on food_diary.recipe_item.nutrition_item_id = food_diary.nutrition_item.id
where recipe_id = recipe.id) recipe_item_with_added_sugar;
$$;

-- Create helper function to calculate diary entry protein
-- Note: UNION is safe here due to has_recipe_xor_item constraint ensuring only one ID is set
CREATE FUNCTION food_diary.diary_entry_protein(diary_entry food_diary.diary_entry) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
select diary_entry.servings * food_diary.recipe_protein(recipe) as protein
from food_diary.recipe
where id = diary_entry.recipe_id
union
select diary_entry.servings * protein_grams
from food_diary.nutrition_item
where id = diary_entry.nutrition_item_id
$$;

-- Create helper function to calculate diary entry added sugar
-- Note: UNION is safe here due to has_recipe_xor_item constraint ensuring only one ID is set
CREATE FUNCTION food_diary.diary_entry_added_sugar(diary_entry food_diary.diary_entry) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
select diary_entry.servings * food_diary.recipe_added_sugar(recipe) as added_sugar
from food_diary.recipe
where id = diary_entry.recipe_id
union
select diary_entry.servings * added_sugars_grams
from food_diary.nutrition_item
where id = diary_entry.nutrition_item_id
$$;
