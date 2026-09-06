CREATE TABLE food_diary.search_result (
  type text,
  score real,
  nutrition_item_id integer,
  recipe_id integer
);

CREATE FUNCTION food_diary.search_all(
  search text,
  hasura_session json DEFAULT NULL
)
RETURNS SETOF food_diary.search_result
LANGUAGE sql STABLE AS $$
select
  'item'::text as type,
  similarity(search, nutrition_item.description) as score,
  nutrition_item.id as nutrition_item_id,
  null::integer as recipe_id
from food_diary.nutrition_item
where search <% (description)
  and user_id = hasura_session ->> 'x-hasura-user-id'
union all
select
  'recipe'::text as type,
  similarity(search, recipe.name) as score,
  null::integer as nutrition_item_id,
  recipe.id as recipe_id
from food_diary.recipe
where search <% (name)
  and user_id = hasura_session ->> 'x-hasura-user-id'
order by score desc
$$;
