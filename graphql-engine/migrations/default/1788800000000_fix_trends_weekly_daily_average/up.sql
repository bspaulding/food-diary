-- Fix trends_weekly view: it was averaging nutrition per diary_entry (i.e. per
-- individual food item logged), not per day. A user typically logs several
-- entries a day, so the previous view produced "average daily calories" that
-- were actually "average calories per entry" -- far lower than real daily
-- totals. Aggregate to one row per user/day first, then average those daily
-- totals within each week.
CREATE OR REPLACE VIEW "food_diary"."trends_weekly" AS
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
