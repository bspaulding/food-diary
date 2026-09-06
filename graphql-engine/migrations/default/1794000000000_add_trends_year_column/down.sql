-- Down migration for adding a ‘year’ column to the food_diary.trends_weekly view.
-- It restores the prior view definition (per-day averaging, no year column) from
-- 1788800000000_fix_trends_weekly_daily_average.

DROP VIEW IF EXISTS "food_diary"."trends_weekly";

CREATE VIEW "food_diary"."trends_weekly" AS
  SELECT
    AVG(daily.calories)::float AS calories,
    AVG(daily.protein)::float AS protein,
    AVG(daily.added_sugar)::float AS added_sugar,
    daily.user_id,
    daily.week_of_year
  FROM (
    SELECT
      SUM(food_diary.diary_entry_calories(diary_entry.*)) AS calories,
      SUM(food_diary.diary_entry_protein(diary_entry.*)) AS protein,
      SUM(food_diary.diary_entry_added_sugar(diary_entry.*)) AS added_sugar,
      diary_entry.user_id,
      food_diary.diary_entry_day(diary_entry.*) AS day,
      EXTRACT(WEEK FROM diary_entry.consumed_at)::int AS week_of_year
    FROM food_diary.diary_entry
    GROUP BY diary_entry.user_id, food_diary.diary_entry_day(diary_entry.*), EXTRACT(WEEK FROM diary_entry.consumed_at)
  ) daily
  GROUP BY daily.user_id, daily.week_of_year;
