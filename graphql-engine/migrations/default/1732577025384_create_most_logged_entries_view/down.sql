-- Could not auto-generate a down migration.
-- Please write an appropriate down migration for the SQL below:
-- create or replace view food_diary.most_logged_entries as
-- select nutrition_item_id, recipe_id, count(*) as times_logged
-- from food_diary.diary_entry
-- group by nutrition_item_id, recipe_id;
drop view food_diary.most_logged_entries;
