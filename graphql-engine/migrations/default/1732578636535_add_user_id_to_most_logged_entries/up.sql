CREATE OR REPLACE VIEW "food_diary"."most_logged_entries" AS 
 SELECT diary_entry.nutrition_item_id,
    diary_entry.recipe_id,
    count(*) AS times_logged,
    diary_entry.user_id
   FROM food_diary.diary_entry
  GROUP BY diary_entry.user_id, diary_entry.nutrition_item_id, diary_entry.recipe_id;
