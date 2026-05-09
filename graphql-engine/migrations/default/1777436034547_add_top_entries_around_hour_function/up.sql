CREATE TABLE food_diary.top_entries_result (
  consumed_at timestamptz,
  nutrition_item_id integer,
  recipe_id integer
);

CREATE OR REPLACE FUNCTION food_diary.top_entries_around_hour(
  start_hour integer,
  end_hour integer,
  n integer DEFAULT 10,
  hasura_session json DEFAULT NULL
)
RETURNS SETOF food_diary.top_entries_result
LANGUAGE sql STABLE AS $$
SELECT MAX(consumed_at), nutrition_item_id, recipe_id
FROM food_diary.diary_entry
WHERE EXTRACT(HOUR FROM consumed_at)::integer >= start_hour
  AND EXTRACT(HOUR FROM consumed_at)::integer <= end_hour
  AND user_id = hasura_session ->> 'x-hasura-user-id'
GROUP BY nutrition_item_id, recipe_id
ORDER BY COUNT(*) DESC
LIMIT n
$$;
