-- Migration to add a ‘year’ column to the food_diary.trends_weekly view.
-- It replaces the existing view with a new definition that groups by both year and week,
-- while preserving the per-day averaging from 1788800000000_fix_trends_weekly_daily_average
-- (averaging per diary_entry instead of per day would silently reintroduce that bug).

-- Drop the existing view if it exists.
DROP VIEW IF EXISTS "food_diary"."trends_weekly";

-- Recreate the view with the additional year column.
CREATE VIEW "food_diary"."trends_weekly" AS
  SELECT
    AVG(daily.calories)::float AS calories,
    AVG(daily.protein)::float AS protein,
    AVG(daily.added_sugar)::float AS added_sugar,
    daily.user_id,
    daily.year,
    daily.week_of_year
  FROM (
    SELECT
      SUM(food_diary.diary_entry_calories(diary_entry.*)) AS calories,
      SUM(food_diary.diary_entry_protein(diary_entry.*)) AS protein,
      SUM(food_diary.diary_entry_added_sugar(diary_entry.*)) AS added_sugar,
      diary_entry.user_id,
      food_diary.diary_entry_day(diary_entry.*) AS day,
      EXTRACT(YEAR FROM diary_entry.consumed_at)::int AS year,
      EXTRACT(WEEK FROM diary_entry.consumed_at)::int AS week_of_year
    FROM food_diary.diary_entry
    GROUP BY diary_entry.user_id,
             food_diary.diary_entry_day(diary_entry.*),
             EXTRACT(YEAR FROM diary_entry.consumed_at),
             EXTRACT(WEEK FROM diary_entry.consumed_at)
  ) daily
  GROUP BY daily.user_id, daily.year, daily.week_of_year;
