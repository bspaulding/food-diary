-- Create trends_weekly view to aggregate nutritional data by week and user
-- Note: week_of_year groups by ISO week number (1-53) without year distinction
-- This means week 1 of different years will be aggregated together
-- Consider filtering by date range when querying for multi-year trend analysis
CREATE OR REPLACE VIEW "food_diary"."trends_weekly" AS 
  SELECT 
    AVG(food_diary.diary_entry_calories(diary_entry.*))::float AS calories,
    AVG(food_diary.diary_entry_protein(diary_entry.*))::float AS protein,
    AVG(food_diary.diary_entry_added_sugar(diary_entry.*))::float AS added_sugar,
    diary_entry.user_id,
    EXTRACT(WEEK FROM diary_entry.consumed_at)::int AS week_of_year
  FROM food_diary.diary_entry
  GROUP BY diary_entry.user_id, EXTRACT(WEEK FROM diary_entry.consumed_at);
