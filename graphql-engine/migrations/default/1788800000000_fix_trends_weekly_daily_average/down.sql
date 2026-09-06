-- Revert to averaging per diary_entry (the buggy behavior)
CREATE OR REPLACE VIEW "food_diary"."trends_weekly" AS
  SELECT
    AVG(food_diary.diary_entry_calories(diary_entry.*))::float AS calories,
    AVG(food_diary.diary_entry_protein(diary_entry.*))::float AS protein,
    AVG(food_diary.diary_entry_added_sugar(diary_entry.*))::float AS added_sugar,
    diary_entry.user_id,
    EXTRACT(WEEK FROM diary_entry.consumed_at)::int AS week_of_year
  FROM food_diary.diary_entry
  GROUP BY diary_entry.user_id, EXTRACT(WEEK FROM diary_entry.consumed_at);
