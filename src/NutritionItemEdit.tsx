import type { Component } from "solid-js";
import { Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { fetchNutritionItem } from "./Api";
import createAuthorizedResource from "./createAuthorizedResource";
import NewNutritionItemForm from "./NewNutritionItemForm";

const NutritionItemEdit: Component = () => {
  const params = useParams();
  const [nutritionItemQuery] = createAuthorizedResource(
    () => params.id,
    fetchNutritionItem
  );

  const nutritionItem = () =>
    nutritionItemQuery()?.data?.food_diary_nutrition_item_by_pk || {};
  return (
    <Show when={nutritionItem().id}>
      <NewNutritionItemForm initialItem={nutritionItem()} />
    </Show>
  );
};

export default NutritionItemEdit;
