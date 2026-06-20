CREATE TABLE food_diary.nutrition_target (
    user_id text NOT NULL PRIMARY KEY,
    calories numeric NOT NULL DEFAULT 2000,
    calories_max numeric NOT NULL DEFAULT 2400,
    protein_grams numeric NOT NULL DEFAULT 130,
    dietary_fiber_grams numeric NOT NULL DEFAULT 25,
    added_sugars_grams numeric NOT NULL DEFAULT 25,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_food_diary_nutrition_target_updated_at
    BEFORE UPDATE ON food_diary.nutrition_target
    FOR EACH ROW
    EXECUTE FUNCTION food_diary.set_current_timestamp_updated_at();
