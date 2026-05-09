import type { Component } from "solid-js";
import { Show } from "solid-js";
import { useParams } from "@solidjs/router";
import createAuthorizedResource from "./createAuthorizedResource";
import { fetchRecipe, Recipe, RecipeItem } from "./Api";
import NewRecipeForm from "./NewRecipeForm";

type RecipeQueryResult = {
  id?: number;
  name?: string;
  total_servings?: number;
  recipe_items?: RecipeItem[];
};

const RecipeEdit: Component = () => {
  const params = useParams();
  const [recipeQuery] = createAuthorizedResource(
    () => params.id,
    (token: string, id: string) => fetchRecipe(token, parseInt(id, 10)),
  );
  const recipe = (): RecipeQueryResult =>
    recipeQuery()?.data?.food_diary_recipe_by_pk || {};

  return (
    <Show when={recipe().id}>
      <NewRecipeForm initialRecipe={recipe() as Recipe & RecipeQueryResult} />
    </Show>
  );
};

export default RecipeEdit;
