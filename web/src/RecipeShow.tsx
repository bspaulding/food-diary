import type { Component } from "solid-js";
import { createMemo, Index, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import createAuthorizedResource from "./createAuthorizedResource";
import { fetchRecipe, RecipeItem } from "./Api";
import ButtonLink from "./ButtonLink";
import { LoggableItem } from "./NewDiaryEntryForm";

type RecipeQueryResult = {
  id?: number;
  name?: string;
  total_servings?: number;
  recipe_items?: RecipeItem[];
};

const calculateItemCalories = (item: RecipeItem): number => {
  return item.servings * (item.nutrition_item.calories || 0);
};

const RecipeShow: Component = () => {
  const params = useParams();
  const [recipeQuery] = createAuthorizedResource(
    () => params.id,
    (token: string, id: string) => fetchRecipe(token, parseInt(id, 10)),
  );
  const recipe = (): RecipeQueryResult =>
    recipeQuery()?.data?.food_diary_recipe_by_pk || {
      id: parseInt(params.id, 10),
    };
  const recipeItems = createMemo(
    (): RecipeItem[] => recipe().recipe_items || [],
  );

  const itemLoaded = (): boolean => !!recipeQuery()?.data;

  const totalCalories = createMemo((): number => {
    return recipeItems().reduce((acc: number, item: RecipeItem) => {
      return acc + calculateItemCalories(item);
    }, 0);
  });

  const caloriesPerServing = createMemo((): number => {
    const totalServings = recipe().total_servings;
    const servings: number =
      totalServings !== undefined && totalServings !== null && totalServings > 0
        ? totalServings
        : 1;
    return totalCalories() / servings;
  });

  return (
    <div style={{ margin: "18px" }}>
      <div class="flex space-x-4 mb-4">
        <ButtonLink href="/">Back to Diary</ButtonLink>
        <ButtonLink href={`/recipe/${params.id}/edit`}>Edit Recipe</ButtonLink>
      </div>
      <h1 class="font-semibold text-2xl">{recipe().name}</h1>
      <Show when={itemLoaded()}>
        <LoggableItem
          recipe={
            {
              id:
                recipe().id !== undefined && recipe().id !== null
                  ? recipe().id
                  : 0,
              name: "Log It",
            } as {
              id: number;
              name: string;
            }
          }
        />
      </Show>
      <Show when={itemLoaded()}>
        <p class="text-lg font-semibold mt-4">
          Total Calories: {Math.round(totalCalories())} kcal
        </p>
        <p class="text-lg font-semibold mt-2">
          Calories per Serving: {Math.round(caloriesPerServing())} kcal
        </p>
      </Show>
      <div class="text-lg mt-4">
        <h2 class="font-semibold mb-2">Ingredients:</h2>
        <Index each={recipeItems()} fallback="No recipe items.">
          {(item: () => RecipeItem) => (
            <li class="list-none my-1">
              <a href={`/nutrition_item/${item().nutrition_item.id}`}>
                {item().nutrition_item.description}
              </a>
              <p class="text-sm">
                {item().servings} servings -{" "}
                {Math.round(calculateItemCalories(item()))} kcal
              </p>
            </li>
          )}
        </Index>
      </div>
    </div>
  );
};

export default RecipeShow;
