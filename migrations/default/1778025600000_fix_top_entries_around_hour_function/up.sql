DROP FUNCTION IF EXISTS food_diary.top_entries_around_hour(integer, integer, integer, json);

CREATE OR REPLACE FUNCTION food_diary.top_entries_around_hour(start_hour integer, end_hour integer)
RETURNS SETOF food_diary.top_entries_result
LANGUAGE sql STABLE AS $$
SELECT MAX(consumed_at), nutrition_item_id, recipe_id
FROM food_diary.diary_entry
WHERE EXTRACT(HOUR FROM consumed_at AT TIME ZONE 'UTC')::integer >= start_hour
  AND EXTRACT(HOUR FROM consumed_at AT TIME ZONE 'UTC')::integer <= end_hour
GROUP BY nutrition_item_id, recipe_id
ORDER BY COUNT(*) DESC
LIMIT 5
$$;
