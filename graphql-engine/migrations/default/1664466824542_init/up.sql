CREATE EXTENSION pg_trgm;
SET check_function_bodies = false;
CREATE SCHEMA food_diary;
CREATE TABLE food_diary.diary_entry (
    id integer NOT NULL,
    consumed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    servings numeric NOT NULL,
    recipe_id integer,
    nutrition_item_id integer,
    user_id text NOT NULL,
    CONSTRAINT has_recipe_xor_item CHECK (((((recipe_id IS NOT NULL))::integer + ((nutrition_item_id IS NOT NULL))::integer) = 1))
);
CREATE FUNCTION food_diary.diary_entry_calories(diary_entry food_diary.diary_entry) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
select diary_entry.servings * food_diary.recipe_calories(recipe) as calories
from food_diary.recipe
where id = diary_entry.recipe_id
union
select diary_entry.servings * calories
from food_diary.nutrition_item
where id = diary_entry.nutrition_item_id
$$;
CREATE FUNCTION food_diary.diary_entry_day(diary_entry_row food_diary.diary_entry) RETURNS date
    LANGUAGE sql STABLE
    AS $$
    SELECT date_trunc('day', diary_entry_row.consumed_at)
$$;
CREATE TABLE food_diary.recipe (
    id integer NOT NULL,
    name text NOT NULL,
    total_servings integer NOT NULL,
    user_id text NOT NULL
);
CREATE FUNCTION food_diary.recipe_calories(recipe food_diary.recipe) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
select sum(total_calories) from (
select recipe_id, servings, calories, servings * calories as total_calories
from food_diary.recipe_item
left outer join food_diary.nutrition_item
on food_diary.recipe_item.nutrition_item_id = food_diary.nutrition_item.id
where recipe_id = recipe.id) recipe_item_with_calories;
$$;
CREATE TABLE food_diary.nutrition_item (
    id integer NOT NULL,
    description text NOT NULL,
    calories integer NOT NULL,
    total_fat_grams numeric NOT NULL,
    saturated_fat_grams numeric NOT NULL,
    trans_fat_grams numeric NOT NULL,
    polyunsaturated_fat_grams numeric NOT NULL,
    monounsaturated_fat_grams numeric NOT NULL,
    cholesterol_milligrams numeric NOT NULL,
    sodium_milligrams numeric NOT NULL,
    total_carbohydrate_grams numeric NOT NULL,
    dietary_fiber_grams numeric NOT NULL,
    total_sugars_grams numeric NOT NULL,
    added_sugars_grams numeric NOT NULL,
    protein_grams numeric NOT NULL,
    user_id text NOT NULL
);
CREATE FUNCTION food_diary.search_nutrition_items(search text) RETURNS SETOF food_diary.nutrition_item
    LANGUAGE sql STABLE
    AS $$
select *
from food_diary.nutrition_item
where search <% (description)
order by similarity(search, (description)) desc
$$;
CREATE FUNCTION food_diary.search_recipes(search text) RETURNS SETOF food_diary.recipe
    LANGUAGE sql STABLE
    AS $$
select *
from food_diary.recipe
where search <% (name)
order by similarity(search, (name)) desc
$$;
CREATE FUNCTION food_diary.set_current_timestamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$;
CREATE SEQUENCE food_diary.diary_entry_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE food_diary.diary_entry_id_seq OWNED BY food_diary.diary_entry.id;
CREATE VIEW food_diary.diary_entry_recent AS
 SELECT diary_entry.id,
    diary_entry.consumed_at,
    diary_entry.created_at,
    diary_entry.updated_at,
    diary_entry.servings,
    diary_entry.recipe_id,
    diary_entry.nutrition_item_id,
    diary_entry.user_id
   FROM food_diary.diary_entry
  ORDER BY (abs((date_part('hour'::text, now()) - date_part('hour'::text, diary_entry.consumed_at))));
CREATE SEQUENCE food_diary.nutrition_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE food_diary.nutrition_item_id_seq OWNED BY food_diary.nutrition_item.id;
CREATE VIEW food_diary.recently_logged_items AS
 SELECT DISTINCT diary_entry_recent.recipe_id,
    diary_entry_recent.nutrition_item_id,
    diary_entry_recent.user_id
   FROM food_diary.diary_entry_recent;
CREATE SEQUENCE food_diary.recipe_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE food_diary.recipe_id_seq OWNED BY food_diary.recipe.id;
CREATE TABLE food_diary.recipe_item (
    recipe_id integer NOT NULL,
    servings numeric,
    nutrition_item_id integer NOT NULL,
    user_id text NOT NULL
);
ALTER TABLE ONLY food_diary.diary_entry ALTER COLUMN id SET DEFAULT nextval('food_diary.diary_entry_id_seq'::regclass);
ALTER TABLE ONLY food_diary.nutrition_item ALTER COLUMN id SET DEFAULT nextval('food_diary.nutrition_item_id_seq'::regclass);
ALTER TABLE ONLY food_diary.recipe ALTER COLUMN id SET DEFAULT nextval('food_diary.recipe_id_seq'::regclass);
ALTER TABLE ONLY food_diary.diary_entry
    ADD CONSTRAINT diary_entry_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_diary.nutrition_item
    ADD CONSTRAINT nutrition_item_pkey PRIMARY KEY (id);
ALTER TABLE ONLY food_diary.recipe_item
    ADD CONSTRAINT recipe_item_pkey PRIMARY KEY (recipe_id, nutrition_item_id);
ALTER TABLE ONLY food_diary.recipe
    ADD CONSTRAINT recipe_pkey PRIMARY KEY (id);
CREATE INDEX nutrition_item_description_gin_idx ON food_diary.nutrition_item USING gin (description public.gin_trgm_ops);
CREATE INDEX recipe_name_gin_idx ON food_diary.recipe USING gin (name public.gin_trgm_ops);
CREATE TRIGGER set_food_diary_diary_entry_updated_at BEFORE UPDATE ON food_diary.diary_entry FOR EACH ROW EXECUTE FUNCTION food_diary.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_food_diary_diary_entry_updated_at ON food_diary.diary_entry IS 'trigger to set value of column "updated_at" to current timestamp on row update';
ALTER TABLE ONLY food_diary.diary_entry
    ADD CONSTRAINT diary_entry_nutrition_item_id_fkey FOREIGN KEY (nutrition_item_id) REFERENCES food_diary.nutrition_item(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY food_diary.diary_entry
    ADD CONSTRAINT diary_entry_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES food_diary.recipe(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY food_diary.recipe_item
    ADD CONSTRAINT recipe_item_nutrition_item_id_fkey FOREIGN KEY (nutrition_item_id) REFERENCES food_diary.nutrition_item(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY food_diary.recipe_item
    ADD CONSTRAINT recipe_item_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES food_diary.recipe(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
