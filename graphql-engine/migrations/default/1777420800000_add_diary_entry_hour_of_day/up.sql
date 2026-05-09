CREATE FUNCTION food_diary.diary_entry_hour_of_day(entry food_diary.diary_entry)
RETURNS integer STABLE LANGUAGE sql AS $$
  SELECT EXTRACT(HOUR FROM entry.consumed_at)::integer
$$;
